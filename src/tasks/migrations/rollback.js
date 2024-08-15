import pc from 'picocolors'
import fs from 'fs-extra'
import { checkExistenceFilesInRollBackDirectory, urlTofRollbackMigrationFile } from './utils'
const MIGRATIONS_ROLLBACK_DIRECTORY = `${process.cwd()}/migrations/rollback`

/**
 * @method rollbackMigration
 * @param  {Object}   api       api instance
 * @param  {String}   component name of the component to rollback
 * @param  {String}   field     name of the field to rollback
 * @return {Promise}
 */

const rollbackMigration = async (api, field, component) => {
  if (!fs.existsSync(MIGRATIONS_ROLLBACK_DIRECTORY)) {
    console.log(`
        ${pc.red('X')} To execute the rollback-migration command you need to have changed some component with the migrations commands.`
    )
    return
  }

  console.log(
    `${pc.blue('-')} Checking if the rollback files exist`
  )

  try {
    checkExistenceFilesInRollBackDirectory(MIGRATIONS_ROLLBACK_DIRECTORY, component, field)
      .then(data => {
        if (!data) {
          return console.log(`${pc.red('X')} Rollback file for component ${pc.blue(component)} and field ${pc.blue(field)} was not found`)
        }
      })

    console.log()
    console.log(
      `${pc.blue('-')} Starting rollback...`
    )
    console.log()

    let rollbackContent = await fs.readFile(urlTofRollbackMigrationFile(component, field), 'utf-8')
    rollbackContent = JSON.parse(rollbackContent)

    for (const story of rollbackContent) {
      console.log(
        `${pc.blue('-')} Restoring data from "${pc.blue(story.full_slug)}" ...`
      )
      await api.put(`stories/${story.id}`, {
        story: { content: story.content },
        force_update: '1'
      })
      console.log(
        `  ${pc.blue('-')} ${story.full_slug} data has been restored!`
      )
      console.log()
    }

    console.log(
      `${pc.green('✓')} The roolback-migration was executed with success!`
    )
    return Promise.resolve({ rollback: true })
  } catch (err) {
    console.log(`${pc.red('X')} The rollback-migration command was not successfully executed: ${err}`)
    return Promise.reject(err)
  }
}

export default rollbackMigration
