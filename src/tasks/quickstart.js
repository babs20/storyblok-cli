import open from 'open'
import pc from 'picocolors'
import lastStep from '../utils/last-step'

const hasSpaceId = spaceId => typeof spaceId !== 'undefined'

const quickstart = async (api, answers, spaceId) => {
  answers.type = 'quickstart'

  if (hasSpaceId(spaceId)) {
    console.log(`${pc.blue('-')} Your project will be initialized now...`)

    const config = {
      space: {
        environments: [{ name: 'Dev', location: 'http://localhost:4440/' }]
      }
    }

    const spaceUrl = 'spaces/' + spaceId + '/'

    try {
      const spaceRes = await api.put(spaceUrl, config)
      answers.name = spaceRes.data.space.name.replace(/\s+/g, '-').toLowerCase()
      console.log(`${pc.green('✓')} - Space ${answers.name} updated with dev environment in Storyblok`)

      const tokensRes = await api.post('tokens', {})
      console.log(`${pc.green('✓')} - Configuration for your Space was loaded`)
      answers.loginToken = tokensRes.data.key

      api.setSpaceId(spaceRes.data.space.id)

      const keysRes = await api.get('api_keys')

      answers.spaceId = spaceRes.data.space.id
      answers.spaceDomain = spaceRes.data.space.domain.replace('https://', '').replace('/', '')

      const tokens = keysRes.data.api_keys.filter((token) => {
        return token.access === 'theme'
      })

      if (tokens.length === 0) {
        throw new Error('There is no theme token in this space')
      }

      answers.themeToken = tokens[0].token

      console.log(`${pc.green('✓')} - Development Environment configured (./${answers.name}/config.js)`)
      return lastStep(answers)
    } catch (e) {
      return Promise.reject(new Error(e.message))
    }
  }

  console.log(`${pc.blue('-')} Your project will be created now...`)

  const config = {
    // create_demo: true,
    space: {
      name: answers.name
    }
  }

  try {
    const spaceRes = await api.post('spaces', config)
    console.log(`${pc.green('✓')} - Space ${answers.name} has been created in Storyblok`)
    console.log(`${pc.green('✓')} - Story "home" has been created in your Space`)

    const tokensRes = await api.post('tokens', {})

    api.setSpaceId(spaceRes.data.space.id)

    console.log(`${pc.green('✓')} - Configuration for your Space was loaded`)
    answers.loginToken = tokensRes.data.key

    answers.spaceId = spaceRes.data.space.id
    answers.spaceDomain = spaceRes.data.space.domain.replace('https://', '')
      .replace('/', '')

    console.log(`${pc.green('✓')} - Starting Storyblok in your browser`)

    setTimeout(() => {
      open('http://' + answers.spaceDomain + '/_quickstart?quickstart=' + answers.loginToken)
      process.exit(0)
    }, 2000)
  } catch (e) {
    console.error(`${pc.red('X')} An error occurred when create space and execute some tasks`)
    console.error(e)
  }
}

export default quickstart
