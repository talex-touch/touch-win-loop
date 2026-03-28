import { teamFirstApiRemoved } from '~~/server/utils/team-first'

export default defineEventHandler((event) => {
  return teamFirstApiRemoved(event)
})
