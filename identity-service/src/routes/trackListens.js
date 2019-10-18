const models = require('../models')
const { handleResponse, successResponse, errorResponseBadRequest } = require('../apiHelpers')
const { logger } = require('../logging')

async function getListenHour () {
  let listenDate = new Date()
  listenDate.setMinutes(0)
  listenDate.setSeconds(0)
  listenDate.setUTCMilliseconds(0)
  return listenDate
}

let oneDayInMs = (24 * 60 * 60 * 1000)
let oneWeekInMs = oneDayInMs * 7
let oneMonthInMs = oneDayInMs * 30
let oneYearInMs = oneMonthInMs * 12

const parseTimeframe = (inputTime) => {
  switch (inputTime) {
    case 'day':
    case 'week':
    case 'month':
    case 'year':
    case 'millennium':
      break
    default:
      inputTime = undefined
  }

  // Allow default empty value
  if (inputTime === undefined) {
    inputTime = 'millennium'
  }
  return inputTime
}

const getTrackListens = async (
  idList,
  timeFrame = undefined,
  startTime = undefined,
  endTime = undefined,
  limit = undefined,
  offset = undefined) => {
  if (idList !== undefined && !Array.isArray(idList)) {
    return errorResponseBadRequest('Invalid id list provided. Please provide an array of track IDs')
  }
  let boundariesRequested = false
  try {
    if (startTime !== undefined && endTime !== undefined) {
      startTime = Date.parse(startTime)
      endTime = Date.parse(endTime)
      boundariesRequested = true
    }
  } catch (e) {
    logger.error(e)
  }

  // Allow default empty value
  if (timeFrame === undefined) {
    timeFrame = 'millennium'
  }

  let dbQuery = {
    attributes: [
      [models.Sequelize.col('trackId'), 'trackId'],
      [
        models.Sequelize.fn('date_trunc', timeFrame, models.Sequelize.col('hour')),
        'date'
      ],
      [models.Sequelize.fn('sum', models.Sequelize.col('listens')), 'listens']
    ],
    group: ['trackId', 'date'],
    order: [[models.Sequelize.col('listens'), 'DESC']],
    where: {}
  }
  if (idList && idList.length > 0) {
    dbQuery.where.trackId = { [models.Sequelize.Op.in]: idList }
  }

  if (limit) {
    dbQuery.limit = limit
  }

  if (offset) {
    dbQuery.offset = offset
  }

  if (boundariesRequested) {
    dbQuery.where.hour = { [models.Sequelize.Op.gte]: startTime, [models.Sequelize.Op.lte]: endTime }
  }
  let listenCounts = await models.TrackListenCount.findAll(dbQuery)
  let output = {}
  for (let i = 0; i < listenCounts.length; i++) {
    let currentEntry = listenCounts[i]
    let values = currentEntry.dataValues
    let date = (values['date']).toISOString()
    let listens = parseInt(values.listens)
    currentEntry.dataValues.listens = listens
    let trackId = values.trackId
    if (!output.hasOwnProperty(date)) {
      output[date] = {}
      output[date]['utcMilliseconds'] = values['date'].getTime()
      output[date]['totalListens'] = 0
      output[date]['trackIds'] = []
      output[date]['listenCounts'] = []
    }

    output[date]['totalListens'] += listens
    if (!output[date]['trackIds'].includes(trackId)) {
      output[date]['trackIds'].push(trackId)
    }

    output[date]['listenCounts'].push(currentEntry)
    output[date]['timeFrame'] = timeFrame
  }
  return output
}

const getTrendingTracks = async (
  idList,
  timeFrame,
  limit,
  offset) => {
  if (idList !== undefined && !Array.isArray(idList)) {
    return errorResponseBadRequest('Invalid id list provided. Please provide an array of track IDs')
  }

  let dbQuery = {
    attributes: ['trackId', [models.Sequelize.fn('sum', models.Sequelize.col('listens')), 'listens']],
    group: ['trackId'],
    order: [[models.Sequelize.col('listens'), 'DESC'], [models.Sequelize.col('trackId'), 'DESC']],
    where: {}
  }
  // If id list present, add filter
  if (idList && idList.length > 0) {
    dbQuery.where.trackId = { [models.Sequelize.Op.in]: idList }
  }

  let currentHour = await getListenHour()
  switch (timeFrame) {
    case 'day':
      let oneDayBefore = new Date(currentHour.getTime() - oneDayInMs)
      dbQuery.where.hour = { [models.Sequelize.Op.gte]: oneDayBefore }
      break
    case 'week':
      let oneWeekBefore = new Date(currentHour.getTime() - oneWeekInMs)
      dbQuery.where.hour = { [models.Sequelize.Op.gte]: oneWeekBefore }
      break
    case 'month':
      let oneMonthBefore = new Date(currentHour.getTime() - oneMonthInMs)
      dbQuery.where.hour = { [models.Sequelize.Op.gte]: oneMonthBefore }
      break
    case 'year':
      let oneYearBefore = new Date(currentHour.getTime() - oneYearInMs)
      dbQuery.where.hour = { [models.Sequelize.Op.gte]: oneYearBefore }
      break
    case undefined:
      break
    default:
      return errorResponseBadRequest('Invalid time parameter provided, use day/week/month/year or no parameter')
  }
  if (limit) {
    dbQuery.limit = limit
  }

  if (offset) {
    dbQuery.offset = offset
  }

  let listenCounts = await models.TrackListenCount.findAll(dbQuery)
  let parsedListenCounts = []
  let seenTrackIds = []
  listenCounts.forEach((elem) => {
    parsedListenCounts.push({ trackId: elem.trackId, listens: parseInt(elem.listens) })
    seenTrackIds.push(elem.trackId)
  })
  const seenIdSet = new Set(seenTrackIds)
  if (idList) {
    idList.forEach((elem) => {
      const id = parseInt(elem)
      if (!seenIdSet.has(id)) {
        parsedListenCounts.push({ trackId: id, listens: 0 })
      }
    })
  }
  return parsedListenCounts
}

module.exports = function (app) {
  app.post('/tracks/:id/listen', handleResponse(async (req, res) => {
    const trackId = parseInt(req.params.id)
    if (!req.body.userId || !trackId) {
      return errorResponseBadRequest('Must include user id and valid track id')
    }
    let currentHour = await getListenHour()
    let trackListenRecord = await models.TrackListenCount.findOrCreate(
      {
        where: { hour: currentHour, trackId: req.params.id }
      })
    if (trackListenRecord && trackListenRecord[1]) {
      logger.info(`New track listen record inserted ${trackListenRecord}`)
    }
    await models.TrackListenCount.increment('listens', { where: { hour: currentHour, trackId: req.params.id } })
    return successResponse({})
  }))

  /*
   * Return track listen history grouped by a specific time frame
   *  tracks/listens/
   *    - all tracks, sorted by play count
   *
   *  tracks/listens/<time>
   *    - <time> - day, week, month, year
   *    - returns all track listen info for given time period, sorted by play count
   *
   *  POST body parameters (optional):
   *    limit (int) - limits number of results
   *    offset (int) - offset results
   *    start (string) - ISO time string, used to define the start time period for query
   *    end (string) - ISO time string, used to define the end time period for query
   *    start/end are BOTH required if filtering based on time
   *    track_ids - filter results for specific track(s)
   *
   *  GET query parameters (optional):
   *    limit (int) - limits number of results
   *    offset (int) - offset results
   *    start (string) - ISO time string, used to define the start time period for query
   *    end (string) - ISO time string, used to define the end time period for query
   *    start/end are BOTH required if filtering based on time
   *    id (array of int) - filter results for specific track(s)
   */
  app.post('/tracks/listens/:timeframe*?', handleResponse(async (req, res, next) => {
    let body = req.body
    let idList = body.track_ids
    let limit = body.limit
    let offset = body.offset
    let startTime = body.startTime
    let endTime = body.endTime
    let time = parseTimeframe(req.params.timeframe)
    let output = await getTrackListens(
      idList,
      time,
      startTime,
      endTime,
      limit,
      offset
    )
    return successResponse(output)
  }))

  app.get('/tracks/listens/:timeframe*?', handleResponse(async (req, res) => {
    let limit = req.query.limit
    let offset = req.query.offset
    let idList = req.query.id
    let startTime = req.query.start
    let endTime = req.query.end
    let time = parseTimeframe(req.params.timeframe)
    let output = await getTrackListens(
      idList,
      time,
      startTime,
      endTime,
      limit,
      offset)
    return successResponse(output)
  }))

  /*
   * Return aggregate track listen count with various parameters
   *  tracks/trending/
   *    - all tracks, sorted by play count
   *
   *  tracks/trending/<time>
   *    - <time> - day, week, month, year
   *    - returns all tracks for given time period, sorted by play count
   *
   *  POST body parameters (optional):
   *    limit (int) - limits number of results
   *    offset (int) - offset results
   *    track_ids (array of int) - filter results for specific track(s)
   *
   *  GET query parameters (optional):
   *    limit (int) - limits number of results
   *    offset (int) - offset results
   *    id (array of int) - filter results for specific track(s)
   */
  app.get('/tracks/trending/:time*?', handleResponse(async (req, res) => {
    let time = req.params.time
    let limit = req.query.limit
    let offset = req.query.offset
    let idList = req.query.id

    let parsedListenCounts = await getTrendingTracks(
      idList,
      time,
      limit,
      offset)

    return successResponse({ listenCounts: parsedListenCounts })
  }))

  app.post('/tracks/trending/:timeframe*?', handleResponse(async (req, res) => {
    let time = req.params.time
    let body = req.body
    let idList = body.track_ids
    let limit = body.limit
    let offset = body.offset
    let parsedListenCounts = await getTrendingTracks(
      idList,
      time,
      limit,
      offset)
    return successResponse({ listenCounts: parsedListenCounts })
  }))
}
