import pc from 'picocolors'
import lodash from 'lodash'
import SyncComponentGroups from './component-groups'
import { findByProperty } from '../../utils'
import PresetsLib from '../../utils/presets-lib'
import api from '../../utils/api'
const { find } = lodash

class SyncComponents {
  /**
   * @param {{ sourceSpaceId: string, targetSpaceId: string, oauthToken: string }} options
   */
  constructor (options) {
    this.sourcePresets = []
    this.targetComponents = []
    this.sourceComponents = []
    this.sourceSpaceId = options.sourceSpaceId
    this.targetSpaceId = options.targetSpaceId
    this.oauthToken = options.oauthToken
    this.client = api.getClient()
    this.presetsLib = new PresetsLib({ oauthToken: options.oauthToken, targetSpaceId: this.targetSpaceId })
    this.componentsGroups = options.componentsGroups
    this.componentsFullSync = options.componentsFullSync
  }

  async sync () {
    const syncComponentGroupsInstance = new SyncComponentGroups({
      oauthToken: this.oauthToken,
      sourceSpaceId: this.sourceSpaceId,
      targetSpaceId: this.targetSpaceId
    })

    try {
      const componentsGroupsSynced = await syncComponentGroupsInstance.sync()
      this.sourceComponentGroups = componentsGroupsSynced.source
      this.targetComponentGroups = componentsGroupsSynced.target

      console.log(`${pc.green('-')} Syncing components...`)
      // load data from target and source spaces
      this.sourceComponents = await this.getComponents(this.sourceSpaceId)
      this.targetComponents = await this.getComponents(this.targetSpaceId)

      this.sourcePresets = await this.presetsLib.getPresets(this.sourceSpaceId)

      console.log(
        `${pc.blue('-')} In source space #${this.sourceSpaceId}, it were found: `
      )
      console.log(`  - ${this.sourcePresets.length} presets`)
      console.log(`  - ${this.sourceComponentGroups.length} groups`)
      console.log(`  - ${this.sourceComponents.length} components`)

      console.log(
        `${pc.blue('-')} In target space #${this.targetSpaceId}, it were found: `
      )
      console.log(`  - ${this.targetComponentGroups.length} groups`)
      console.log(`  - ${this.targetComponents.length} components`)
    } catch (e) {
      console.error('An error ocurred when load data to sync: ' + e.message)

      return Promise.reject(e)
    }

    for (var i = 0; i < this.sourceComponents.length; i++) {
      console.log()

      const component = this.sourceComponents[i]
      console.log(pc.blue('-') + ` Processing component ${component.name}`)

      const componentPresets = this.presetsLib.getComponentPresets(component, this.sourcePresets)

      delete component.id
      delete component.created_at

      const sourceGroupUuid = component.component_group_uuid

      if (this.componentsGroups && !this.componentsGroups.includes(sourceGroupUuid)) {
        console.log(
          pc.yellow('-') +
            ` Component ${component.name} does not belong to the ${this.componentsGroups} group(s).`
        )
        continue
      }

      // if the component belongs to a group
      if (sourceGroupUuid) {
        const sourceGroup = findByProperty(
          this.sourceComponentGroups,
          'uuid',
          sourceGroupUuid
        )

        const targetGroupData = findByProperty(
          this.targetComponentGroups,
          'name',
          sourceGroup.name
        )

        console.log(
          `${pc.yellow('-')} Linking the component to the group ${targetGroupData.name}`
        )
        component.component_group_uuid = targetGroupData.uuid
      }

      const { internal_tags_list, internal_tag_ids, ...rest } = component;
      const existingTags = await this.getSpaceInternalTags(this.targetSpaceId);

      let processedInternalTagsIds = [];
      if(internal_tags_list.length > 0) {
        await internal_tags_list.forEach(async (tag) => {
          const existingTag = existingTags.find(({ name }) => tag.name === name);
          if(!existingTag) {
            try {
              const response = await this.createComponentInternalTag(this.targetSpaceId, tag);
              processedInternalTagsIds.push(response.id);
            } catch (e) {
              console.error(pc.red("X") + ` Internal tag ${tag} creation failed: ${e.message}`);
            }
          } else {
            processedInternalTagsIds.push(existingTag.id);
          }
        })
      }

      // Create new component on target space
      const componentData = {
        ...rest,
        internal_tag_ids: processedInternalTagsIds || internal_tag_ids
      }
      try {
        const componentCreated = await this.createComponent(
          this.targetSpaceId,
          componentData
        )

        console.log(pc.green('✓') + ` Component ${component.name} created`)

        if (componentPresets.length) {
          await this.presetsLib.createPresets(componentPresets, componentCreated.id)
        }
      } catch (e) {
        if ((e.response && e.response.status) || e.status === 422) {
          console.log(
            `${pc.yellow('-')} Component ${component.name} already exists, updating it...`
          )

          const componentTarget = this.getTargetComponent(component.name)

          await this.updateComponent(
            this.targetSpaceId,
            componentTarget.id,
            componentData,
            componentTarget
          )
          console.log(pc.green('✓') + ` Component ${component.name} synced`)

          const presetsToSave = this.presetsLib.filterPresetsFromTargetComponent(
            componentPresets || [],
            componentTarget.all_presets || []
          )

          if (presetsToSave.newPresets.length) {
            await this.presetsLib.createPresets(presetsToSave.newPresets, componentTarget.id, 'post')
          }

          if (presetsToSave.updatePresets.length) {
            await this.presetsLib.createPresets(presetsToSave.updatePresets, componentTarget.id, 'put')
          }

          console.log(pc.green('✓') + ' Presets in sync')
        } else {
          console.error(pc.red('X') + ` Component ${component.name} sync failed: ${e.message}`)
        }
      }
    }
  }

  getComponents (spaceId) {
    console.log(
      `${pc.green('-')} Load components from space #${spaceId}`
    )

    return this.client.get(`spaces/${spaceId}/components`)
      .then(response => response.data.components || [])
  }

  getTargetComponent (name) {
    return find(this.targetComponents, ['name', name]) || {}
  }

  createComponent (spaceId, componentData) {
    const payload = {
      component: {
        ...componentData,
        schema: this.mergeComponentSchema(
          componentData.schema
        )
      }
    }

    return this
      .client
      .post(`spaces/${spaceId}/components`, payload)
      .then(response => {
        const component = response.data.component || {}

        return component
      })
      .catch(error => Promise.reject(error))
  }

  updateComponent (
    spaceId,
    componentId,
    sourceComponentData,
    targetComponentData
  ) {
    const payload = {
      component: this.mergeComponents(
        sourceComponentData,
        targetComponentData
      )
    }
    // Unfortunatelly, the internal_tag_ids is not recursive and bot being merged correctly
    payload.component.internal_tag_ids = sourceComponentData.internal_tag_ids
    return this
      .client
      .put(`spaces/${spaceId}/components/${componentId}`, payload)
      .then(response => {
        const component = response.data.component || {}

        return component
      }).catch(error => Promise.reject(error))
  }

  mergeComponents (sourceComponent, targetComponent = {}) {
    const data = this.componentsFullSync ? {
      // This should be the default behavior in a major future version
      ...sourceComponent
    } : {
      ...sourceComponent,
      ...targetComponent
    }

    // handle specifically
    data.schema = this.mergeComponentSchema(
      sourceComponent.schema
    )

    return data
  }

  mergeComponentSchema (sourceSchema) {
    return Object.keys(sourceSchema).reduce((acc, key) => {
      // handle blocks separately
      const sourceSchemaItem = sourceSchema[key]
      const isBloksType = sourceSchemaItem && sourceSchemaItem.type === 'bloks'
      const isRichtextType = sourceSchemaItem && sourceSchemaItem.type === 'richtext'

      if (isBloksType || isRichtextType) {
        acc[key] = this.mergeBloksSchema(sourceSchemaItem)
        return acc
      }

      acc[key] = sourceSchemaItem

      return acc
    }, {})
  }

  mergeBloksSchema (sourceData) {
    return {
      ...sourceData,
      // prevent missing refence to group in whitelist
      component_group_whitelist: this.getWhiteListFromSourceGroups(
        sourceData.component_group_whitelist || []
      )
    }
  }

  getWhiteListFromSourceGroups (whiteList = []) {
    return whiteList.map(sourceGroupUuid => {
      const sourceGroupData = findByProperty(
        this.sourceComponentGroups,
        'uuid',
        sourceGroupUuid
      )

      const targetGroupData = findByProperty(
        this.targetComponentGroups,
        'name',
        sourceGroupData.name
      )

      return targetGroupData.uuid
    })
  }

  getSpaceInternalTags(spaceId) {
    return this.client.get(`spaces/${spaceId}/internal_tags`).then((response) => response.data.internal_tags || []);
  }

  createComponentInternalTag(spaceId, tag) {
    return this.client.post(`spaces/${spaceId}/internal_tags`, {
      internal_tag: {
        name: tag.name,
        object_type: "component"
      }
    })
    .then((response) => response.data.internal_tag || {})
    .catch((error) => Promise.reject(error));
  }
}

export default SyncComponents
