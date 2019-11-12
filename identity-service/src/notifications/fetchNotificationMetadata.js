const moment = require('moment')
const models = require('../models')
const NotificationType = require('../routes/notifications').NotificationType
const Entity = require('../routes/notifications').Entity
const mergeAudiusAnnoucements = require('../routes/notifications').mergeAudiusAnnoucements
const formatNotificationProps = require('./formatNotificationMetadata')

/* Merges the notifications with the user announcements in time sorted order (Most recent first).
 *
 * @param {AudiusLibs} audius                   Audius Libs instance
 * @param {number} userId                       The blockchain user id of the recipient of the user
 * @param {Array<Announcement>} announcements   Announcements set on the app
 * @param {moment Time} fromTime                The moment time object from which to get notifications
 * @param {number?} limit                       The max number of notification to attach in the email
 *
 * @return {Promise<Object>}
 */

const getLastWeek = () => moment().subtract(7, 'days')
async function sendUserNotifcationEmail (audius, userId, announcements = [], fromTime = getLastWeek(), limit = 5) {
  try {
    const user = await models.User.findOne({
      where: { blockchainUserId: userId },
      attributes: ['createdAt']
    })

    const notifications = await models.Notification.findAll({
      where: {
        userId,
        isViewed: false,
        timestamp: {
          [models.Sequelize.Op.gt]: fromTime.toDate()
        }
      },
      order: [
        ['timestamp', 'DESC'],
        ['entityId', 'ASC']
      ],
      include: [{
        model: models.NotificationAction,
        required: true,
        as: 'actions'
      }],
      limit
    })

    const announcementIds = new Set(announcements.map(({ entityId }) => entityId))
    const filteredNotifications = notifications.filter(({ id }) => !announcementIds.has(id))

    const validUserAnnouncements = announcements
      .filter(a => moment(a.datePublished).isAfter(user.createdAt) && moment(a.datePublished).isAfter(fromTime))

    const userNotifications = mergeAudiusAnnoucements(validUserAnnouncements, filteredNotifications).slice(0, limit)
    const metadata = await fetchNotificationMetadata(audius, userId, userNotifications)
    const notificationsEmailProps = formatNotificationProps(userNotifications, metadata)
    return notificationsEmailProps
  } catch (err) {
    console.log(err)
  }
}

async function fetchNotificationMetadata (audius, userId, notifications) {
  let userIdsToFetch = [userId]
  let trackIdsToFetch = []
  let collectionIdsToFetch = []

  for (let notification of notifications) {
    switch (notification.type) {
      case NotificationType.Follow: {
        userIdsToFetch.push(...notification.actions.map(({ actionEntityId }) => actionEntityId))
        break
      }
      case NotificationType.FavoriteTrack:
      case NotificationType.RepostTrack: {
        userIdsToFetch.push(...notification.actions.map(({ actionEntityId }) => actionEntityId))
        trackIdsToFetch.push(notification.entityId)
        break
      }
      case NotificationType.FavoritePlaylist:
      case NotificationType.FavoriteAlbum:
      case NotificationType.RepostPlaylist:
      case NotificationType.RepostAlbum: {
        userIdsToFetch.push(...notification.actions.map(({ actionEntityId }) => actionEntityId))
        collectionIdsToFetch.push(notification.entityId)
        break
      }
      case NotificationType.CreateAlbum:
      case NotificationType.CreatePlaylist: {
        collectionIdsToFetch.push(notification.entityId)
        break
      }
      case NotificationType.MilestoneRepost:
      case NotificationType.MilestoneFavorite:
      case NotificationType.MilestoneListen: {
        if (notification.actions[0].actionEntityType === Entity.Track) {
          trackIdsToFetch.push(notification.actions[0].actionEntityId)
        } else {
          collectionIdsToFetch.push(notification.actions[0].actionEntityId)
        }
        break
      }
      case NotificationType.CreateTrack: {
        trackIdsToFetch.push(...notification.actions.map(({ actionEntityId }) => actionEntityId))
        break
      }
    }
  }

  const uniqueTrackIds = [...new Set(trackIdsToFetch)]
  const tracks = await audius.Track.getTracks(
    /** limit */ uniqueTrackIds.length,
    /** offset */ 0,
    /** idsArray */ uniqueTrackIds
  )

  const uniqueCollectionIds = [...new Set(collectionIdsToFetch)]
  const collections = await audius.Playlist.getPlaylists(
    /** limit */ uniqueCollectionIds.length,
    /** offset */ 0,
    /** idsArray */ uniqueCollectionIds
  )

  userIdsToFetch.push(
    ...tracks.map(({ owner_id: id }) => id),
    ...collections.map(({ playlist_owner_id: id }) => id)
  )
  const uniqueUserIds = [...new Set(userIdsToFetch)]

  const users = await audius.User.getUsers(
    /** limit */ uniqueUserIds.length,
    /** offset */ 0,
    /** idsArray */ uniqueUserIds
  )

  const trackMap = tracks.reduce((tm, track) => {
    tm[track.track_id] = track
    return tm
  }, {})

  const collectionMap = collections.reduce((cm, collection) => {
    cm[collection.playlist_id] = collection
    return cm
  }, {})

  const userMap = users.reduce((um, user) => {
    um[user.user_id] = user
    return um
  }, {})

  return {
    tracks: trackMap,
    collections: collectionMap,
    users: userMap
  }
}

module.exports = sendUserNotifcationEmail
module.exports.fetchNotificationMetadata = fetchNotificationMetadata