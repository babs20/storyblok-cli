import pc from 'picocolors'
import { findByProperty } from '../../utils'
import api from '../../utils/api'

class SyncComponentGroups {
  /**
   * @param {{ sourceSpaceId: string, targetSpaceId: string, oauthToken: string }} options
   */
  constructor (options) {
    this.sourceSpaceId = options.sourceSpaceId
    this.targetSpaceId = options.targetSpaceId
    this.oauthToken = options.oauthToken

    this.sourceComponentGroups = []
    this.targetComponentGroups = []

    this.client = api.getClient()
  }

  async init () {
    console.log(`${pc.green('-')} Syncing component groups...`)

    try {
      this.sourceComponentGroups = await this.getComponentGroups(
        this.sourceSpaceId
      )

      this.targetComponentGroups = await this.getComponentGroups(
        this.targetSpaceId
      )
      return Promise.resolve(true)
    } catch (e) {
      console.error(
        `${pc.red('-')} Error on load components groups from source and target spaces: ${e.message}`
      )
      return Promise.reject(e)
    }
  }

  async sync () {
    try {
      await this.init()

      for (const sourceGroup of this.sourceComponentGroups) {
        console.log()
        console.log(
          pc.blue('-') + ` Processing component group ${sourceGroup.name}`
        )

        const targetGroupData = findByProperty(
          this.targetComponentGroups,
          'name',
          sourceGroup.name
        )

        if (!targetGroupData.uuid) {
          // the group don't exists in target space, creating one
          const sourceGroupName = sourceGroup.name

          try {
            console.log(
              `${pc.blue('-')} Creating the ${sourceGroupName} component group`
            )
            const groupCreated = await this.createComponentGroup(
              this.targetSpaceId,
              sourceGroupName
            )

            this.targetComponentGroups.push(groupCreated)

            console.log(
              `${pc.green('✓')} Component group ${sourceGroupName} created`
            )
          } catch (e) {
            console.error(
              `${pc.red('X')} Component Group ${sourceGroupName} creating failed: ${e.message}`
            )
          }
        } else {
          console.log(
            `${pc.green('✓')} Component group ${targetGroupData.name} already exists`
          )
        }
      }

      return this.loadComponentsGroups()
    } catch (e) {
      console.error(
        `${pc.red('-')} Error on sync component groups: ${e.message}`
      )
      return Promise.reject(e)
    }
  }

  /**
   * @method getComponentGroups
   * @return {Promise<Array>}
   */
  async getComponentGroups (spaceId) {
    console.log(
      `${pc.green('-')} Load component groups from space #${spaceId}`
    )

    return this.client
      .get(`spaces/${spaceId}/component_groups`)
      .then(response => response.data.component_groups || [])
      .catch(err => Promise.reject(err))
  }

  /**
   * @method loadComponentsGroups
   * @return {{source: Array, target: Array}}
   */
  loadComponentsGroups () {
    return {
      source: this.sourceComponentGroups,
      target: this.targetComponentGroups
    }
  }

  /**
   * @method createComponentGroup
   * @param  {string} spaceId
   * @param  {string} componentGroupName
   * @return {{source: Array, target: Array}}
   */
  createComponentGroup (spaceId, componentGroupName) {
    return this
      .client
      .post(`spaces/${spaceId}/component_groups`, {
        component_group: {
          name: componentGroupName
        }
      })
      .then(response => response.data.component_group || {})
      .catch(error => Promise.reject(error))
  }
}

export default SyncComponentGroups
