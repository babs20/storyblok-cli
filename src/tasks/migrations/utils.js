import onChange from 'on-change'
import lodash from 'lodash'
import fs from 'fs-extra'
import pc from 'picocolors'
import { parseError } from '../../utils'
import migrationTemplate from '../templates/migration-file'
const { isArray, isPlainObject, has, isEmpty, template, truncate } = lodash

const MIGRATIONS_DIRECTORY = `${process.cwd()}/migrations`
const MIGRATIONS_ROLLBACK_DIRECTORY = `${process.cwd()}/migrations/rollback`

/**
 * @method getPathToFile
 * @param  {String} fileName      name of the file
 * @param  {String} migrationPath migrations folder
 * @return {String}
 *
 * @example
 * // path/to/migrations/change_teaser_subtitle.js
 * getPathToFile('change_teaser_subtitle.js')
 *
 * // ./migrations/change_teaser_subtitle.js
 * getPathToFile('change_teaser_subtitle.js', './migrations')
 */
export const getPathToFile = (fileName, migrationPath = null) => {
  const pathTo = isEmpty(migrationPath) ? MIGRATIONS_DIRECTORY : migrationPath

  return `${pathTo}/${fileName}`
}

/**
 * @method getNameOfMigrationFile
 * @param  {String} component name of component
 * @param  {String} field     name of component's field
 * @return {String}
 *
 * @example
 * getNameOfMigrationFile('product', 'price') // change_product_price
 */
export const getNameOfMigrationFile = (component, field) => {
  return `change_${component}_${field}.js`
}

/**
 * @method getComponentsFromName
 * @param  {Object} api       API Object
 * @param  {String} component name of component
 * @return {Promise<Array>}
 */
export const getStoriesByComponent = async (api, componentName) => {
  try {
    const stories = await api.getStories({
      contain_component: componentName
    })

    return stories
  } catch (e) {
    const error = parseError(e)
    console.error(`${pc.red('X')} An error ocurred when load the stories filtering by component ${componentName}: ${error.message}`)

    return Promise.reject(error.error)
  }
}

/**
 * @method getComponentsFromName
 * @param  {Object} api       API Object
 * @param  {String} component name of component
 * @return {Promise<Object>}
 */
export const getComponentsFromName = async (api, componentName) => {
  try {
    const components = await api.getComponents()

    const found = components.filter(_comp => {
      return _comp.name === componentName
    })

    if (found.length > 0) {
      return Promise.resolve(found[0])
    }

    return {}
  } catch (e) {
    const error = parseError(e)
    console.error(`${pc.red('X')} An error occurred when loading the components from space: ${error.message}`)

    return Promise.reject(error.error)
  }
}

/**
 * @method checkComponentExists
 * @param  {Object} api       API Object
 * @param  {String} component name of component
 * @return {Promise<Boolean>}
 */
export const checkComponentExists = async (api, component) => {
  try {
    const componentData = await getComponentsFromName(api, component)

    return Promise.resolve(Object.keys(componentData).length > 0)
  } catch (e) {
    const error = parseError(e)
    return Promise.reject(error.error)
  }
}

/**
 * @method checkFileExists
 * @param  {String} filePath
 * @return {Promise<Boolean>}
 */
export const checkFileExists = async (filePath) => fs.pathExists(filePath)

/**
 * @method createMigrationFile
 * @param  {String} fileName path to file
 * @param  {String} field    name of the field
 * @return {Promise<Boolean>}
 */
export const createMigrationFile = (fileName, field) => {
  console.log(`${pc.blue('-')} Creating the migration file in migrations folder`)

  // use lodash.template to replace the occurrences of fieldname
  const compile = template(migrationTemplate, {
    interpolate: /{{([\s\S]+?)}}/g
  })
  const outputMigrationFile = compile({
    fieldname: field
  })

  return fs.outputFile(getPathToFile(fileName), outputMigrationFile)
}

/**
 * @method getInquirerOptions
 * @param  {String} type
 * @return {Array}
 */
export const getInquirerOptions = (type) => {
  if (type === 'file-exists') {
    return [{
      type: 'confirm',
      name: 'choice',
      message: 'Do you want to continue? (This will overwrite the content of the file!)'
    }]
  }

  return []
}

/**
 * @method showMigrationChanges
 * @param  {String} path      field name
 * @param  {unknown} value    updated value
 * @param  {unknown} oldValue previous value
 */
export const showMigrationChanges = (path, value, oldValue) => {
  // It was created a new field
  if (oldValue === undefined) {
    // truncate the string with more than 30 characters
    const _value = truncate(value)

    console.log(`  ${pc.green('-')} Created field "${pc.green(path)}" with value "${pc.green(_value)}"`)
    return
  }

  // It was removed the field
  if (value === undefined) {
    console.log(`  ${pc.red('-')} Removed the field "${pc.red(path)}"`)
    return
  }

  // It was updated the value
  if (value !== oldValue) {
    // truncate the string with more than 30 characters
    const _value = truncate(value)
    const _oldValue = truncate(oldValue)

    console.log(`  ${pc.blue('-')} Updated field "${pc.blue(path)}" from "${pc.blue(_oldValue)}" to "${pc.blue(_value)}"`)
  }
}

/**
 * @method processMigration
 * @param  {Object}   content component structure from Storyblok
 * @param  {String}   component    name of the component that is processing
 * @param  {Function} migrationFn  the migration function defined by user
 * @param  {String} storyFullSlug  the full slug of the containing story
 * @return {Promise<Boolean>}
 */
export const processMigration = async (content = {}, component = '', migrationFn, storyFullSlug) => {
  // I'm processing the component that I want
  if (content.component === component) {
    const watchedContent = onChange(
      content,
      showMigrationChanges
    )

    await migrationFn(watchedContent, storyFullSlug)
  }

  for (const key in content) {
    const value = content[key]

    if (isArray(value)) {
      try {
        await Promise.all(
          value.map(_item => processMigration(_item, component, migrationFn, storyFullSlug))
        )
      } catch (e) {
        console.error(e)
      }
    }

    if (isPlainObject(value) && has(value, 'component')) {
      try {
        await processMigration(value, component, migrationFn, storyFullSlug)
      } catch (e) {
        console.error(e)
      }
    }

    if (isPlainObject(value) && value.type === 'doc' && value.content) {
      value.content.filter(item => item.type === 'blok').forEach(async (item) => {
        try {
          await processMigration(item.attrs.body, component, migrationFn, storyFullSlug)
        } catch (e) {
          console.error(e)
        }
      })
    }
  }

  return Promise.resolve(true)
}

/**
 * @method urlTofRollbackMigrationFile
 * @param  {String}   component name of the component to rollback
 * @param  {String}   field     name of the field to rollback
 * @return {String}
 */

export const urlTofRollbackMigrationFile = (component, field) => {
  return `${MIGRATIONS_ROLLBACK_DIRECTORY}/${getNameOfRollbackMigrationFile(component, field)}`
}

/**
 * @method getNameOfRollbackMigrationFile
 * @param  {String}   component name of the component to rollback
 * @param  {String}   field     name of the field to rollback
 * @return {String}
 */

export const getNameOfRollbackMigrationFile = (component, field) => {
  return `rollback_${component}_${field}.json`
}

/**
 * @method createRollbackFile
 * @param  {Array}   stories    array containing stories for rollback
 * @return {Promise}
 */

export const createRollbackFile = async (stories, component, field) => {
  try {
    if (!fs.existsSync(MIGRATIONS_ROLLBACK_DIRECTORY)) {
      fs.mkdir(MIGRATIONS_ROLLBACK_DIRECTORY)
    }

    const url = urlTofRollbackMigrationFile(component, field)

    if (fs.existsSync(url)) {
      fs.unlinkSync(url)
    }

    fs.writeFile(url, JSON.stringify(stories, null, 2), { flag: 'a' }, (error) => {
      if (error) {
        console.log(`${pc.red('X')} The rollback file could not be created: ${error}`)
        return error
      }
      console.log(`${pc.green('✓')} The rollback file has been created in migrations/rollback/!`)
    })
    return Promise.resolve({
      component: component,
      created: true
    })
  } catch (error) {
    return Promise.reject(error)
  }
}

/**
 * @method checkExistenceFilesInRollBackDirectory
 * @param  {String}   path      path of the rollback folder directories
 * @param  {String}   component name of the components to be searched for in the rollback folder
 * @param  {String}   field     name of the field to be searched for in the rollback folder
 * @return {Promisse<Array>}
 */

export const checkExistenceFilesInRollBackDirectory = (path, component, field) => {
  if (!fs.existsSync(path)) {
    console.log(`
        ${pc.red('X')} The path for which the rollback files should be contained does not exist`
    )
    return Promise.reject(new Error({ error: 'Path not found' }))
  }

  const files = fs.readdirSync(path).map(file => file)

  const file = files.filter((name) => {
    const splitedName = name.split('_')
    if (splitedName[1] === component && splitedName[2] === `${field}.json`) {
      return name
    }
  })
  return Promise.resolve(file)
}
