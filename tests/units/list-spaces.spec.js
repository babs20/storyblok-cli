const { listSpaces } = require('../../src/tasks/')
const { FAKE_SPACES } = require('../constants')
const { EU_CODE, US_CODE, AP_CODE, CA_CODE, CN_CODE } = require('@storyblok/region-helper')

describe('Test spaces method', () => {
  it('Testing list-spaces funtion without api instance', async () => {
    try {
      const spaces = await listSpaces()
      expect(spaces).toStrictEqual([])
    } catch (e) {
      console.error(e)
    }
  })

  it('Testing list-spaces function for China region', async () => {
    const FAKE_API = {
      getAllSpacesByRegion: jest.fn(() => Promise.resolve(FAKE_SPACES()))
    }
    expect(
      await listSpaces(FAKE_API, CN_CODE)
    ).toEqual(FAKE_SPACES())
    expect(FAKE_API.getAllSpacesByRegion).toHaveBeenCalled()
  })

  it('Testing list-spaces funtion for all regions', async () => {
    const FAKE_API = {
      getAllSpacesByRegion: jest.fn(() => Promise.resolve(FAKE_SPACES()))
    }
    const response = [
      {
        key: EU_CODE,
        res: [...FAKE_SPACES()]
      },
      {
        key: US_CODE,
        res: [...FAKE_SPACES()]
      },
      {
        key: CA_CODE,
        res: [...FAKE_SPACES()]
      },
      {
        key: AP_CODE,
        res: [...FAKE_SPACES()]
      }
    ]

    expect(
      await listSpaces(FAKE_API, EU_CODE)
    ).toEqual(response)
  })
})
