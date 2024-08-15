import pc from 'picocolors'

/**
 * @method deleteDatasources
 * @param  {Object} api
 * @param  {Object} options { fileName: string, separateFiles: Boolean, path: String }
 * @return {Promise<Object>}
 */
const deleteDatasources = async (api, options) => {
  const { byName, bySlug } = options

  try {
    let datasources = await api.getDatasources()

    if (bySlug) {
      datasources = datasources.filter(datasource => datasource.slug.toLowerCase().startsWith(bySlug.toLowerCase()))
      const filteredSlugs = datasources.map(obj => obj.slug)
      const formattedSlugs = filteredSlugs.join(', ')

      console.log(`${pc.blue('-')} Datasources where slug starts with ${bySlug}: ${formattedSlugs}`)
    }

    if (byName) {
      datasources = datasources.filter(datasource => datasource.name.toLowerCase().startsWith(byName.toLowerCase()))
      const filteredNames = datasources.map(obj => obj.name)
      const formattedNames = filteredNames.join(', ')

      console.log(`${pc.blue('-')} Datasources where name starts with ${byName}: ${formattedNames}`)
    }

    for (const datasource of datasources) {
      console.log(`${pc.blue('-')} Deleting ${datasource.name}`)
      await api.deleteDatasource(datasource.id)
    }
  } catch (e) {
    console.error(`${pc.red('X')} An error ocurred in delete-components task when deleting a datasource`)
    return Promise.reject(new Error(e))
  }
}

export default deleteDatasources
