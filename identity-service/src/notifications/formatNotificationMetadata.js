const NotificationType = require('../routes/notifications').NotificationType
const Entity = require('../routes/notifications').Entity
const mapMilestone = require('../routes/notifications').mapMilestone
const { actionEntityTypes, notificationTypes } = require('./constants')

const formatFavorite = (notification, metadata, entity) => {
  return {
    type: NotificationType.Favorite,
    users: notification.actions.map(action => {
      const userId = action.actionEntityId
      const user = metadata.users[userId]
      if (!user) return null
      return { name: user.name, image: user.thumbnail }
    }),
    entity
  }
}

const formatRepost = (notification, metadata, entity) => {
  return {
    type: NotificationType.Repost,
    users: notification.actions.map(action => {
      const userId = action.actionEntityId
      const user = metadata.users[userId]
      if (!user) return null
      return { name: user.name, image: user.thumbnail }
    }),
    entity
  }
}

const formatUserSubscription = (notification, metadata, entity, users) => {
  return {
    type: NotificationType.UserSubscription,
    users,
    entity
  }
}

const formatMilestone = (achievement) => (notification, metadata) => {
  return {
    type: NotificationType.Milestone,
    ...mapMilestone[notification.type],
    entity: getMilestoneEntity(notification, metadata),
    value: notification.actions[0].actionEntityId,
    achievement
  }
}

function getMilestoneEntity (notification, metadata) {
  if (notification.type === NotificationType.MilestoneFollow) return undefined
  const type = notification.actions[0].actionEntityType
  const entityId = notification.entityId
  const name = (type === Entity.Track)
    ? metadata.tracks[entityId].title
    : metadata.collections[entityId].playlist_name
  return { type, name }
}

function formatFollow (notification, metadata) {
  return {
    type: NotificationType.Follow,
    users: notification.actions.map(action => {
      const userId = action.actionEntityId
      const user = metadata.users[userId]
      if (!user) return null
      return { name: user.name, image: user.thumbnail }
    })
  }
}

function formatAnnouncement (notification) {
  return {
    type: NotificationType.Announcement,
    text: notification.shortDescription,
    hasReadMore: !!notification.longDescription
  }
}

const notificationResponseMap = {
  [NotificationType.Follow]: formatFollow,
  [NotificationType.FavoriteTrack]: (notification, metadata) => {
    const track = metadata.tracks[notification.entityId]
    return formatFavorite(notification, metadata, { type: Entity.Track, name: track.title })
  },
  [NotificationType.FavoritePlaylist]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    return formatFavorite(notification, metadata, { type: Entity.Playlist, name: collection.playlist_name })
  },
  [NotificationType.FavoriteAlbum]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    return formatFavorite(notification, metadata, { type: Entity.Album, name: collection.playlist_name })
  },
  [NotificationType.RepostTrack]: (notification, metadata) => {
    const track = metadata.tracks[notification.entityId]
    return formatRepost(notification, metadata, { type: Entity.Track, name: track.title })
  },
  [NotificationType.RepostPlaylist]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    return formatRepost(notification, metadata, { type: Entity.Playlist, name: collection.playlist_name })
  },
  [NotificationType.RepostAlbum]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    return formatRepost(notification, metadata, { type: Entity.Album, name: collection.playlist_name })
  },
  [NotificationType.CreateTrack]: (notification, metadata) => {
    const trackId = notification.actions[0].actionEntityId
    const track = metadata.tracks[trackId]
    const count = notification.actions.length
    let user = metadata.users[notification.entityId]
    let users = [{ name: user.name, image: user.thumbnail }]
    return formatUserSubscription(notification, metadata, { type: Entity.Track, count, name: track.title }, users)
  },
  [NotificationType.CreateAlbum]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    let users = notification.actions.map(action => {
      const userId = action.actionEntityId
      const user = metadata.users[userId]
      return { name: user.name, image: user.thumbnail }
    })
    return formatUserSubscription(notification, metadata, { type: Entity.Album, count: 1, name: collection.playlist_name }, users)
  },
  [NotificationType.CreatePlaylist]: (notification, metadata) => {
    const collection = metadata.collections[notification.entityId]
    let users = notification.actions.map(action => {
      const userId = action.actionEntityId
      const user = metadata.users[userId]
      return { name: user.name, image: user.thumbnail }
    })
    return formatUserSubscription(notification, metadata, { type: Entity.Playlist, count: 1, name: collection.playlist_name }, users)
  },
  [NotificationType.Announcement]: formatAnnouncement,
  [NotificationType.MilestoneRepost]: formatMilestone('Repost'),
  [NotificationType.MilestoneFavorite]: formatMilestone('Favorite'),
  [NotificationType.MilestoneListen]: formatMilestone('Listen'),
  [NotificationType.MilestoneFollow]: formatMilestone('Follow')
}

const NewFavoriteTitle = 'New Favorite'
const NewRepostTitle = 'New Repost'
const NewFollowerTitle = 'New Follower'
const NewMilestoneTitle = 'Congratulations! 🎉'
const NewSubscriptionUpdateTitle = 'New Artist Update'

const notificationResponseTitleMap = {
  [NotificationType.Follow]: NewFollowerTitle,
  [NotificationType.FavoriteTrack]: NewFavoriteTitle,
  [NotificationType.FavoritePlaylist]: NewFavoriteTitle,
  [NotificationType.FavoriteAlbum]: NewFavoriteTitle,
  [NotificationType.RepostTrack]: NewRepostTitle,
  [NotificationType.RepostPlaylist]: NewRepostTitle,
  [NotificationType.RepostAlbum]: NewRepostTitle,
  [NotificationType.CreateTrack]: NewSubscriptionUpdateTitle,
  [NotificationType.CreateAlbum]: NewSubscriptionUpdateTitle,
  [NotificationType.CreatePlaylist]: NewSubscriptionUpdateTitle,
  [NotificationType.Milestone]: NewMilestoneTitle
}

function formatNotificationProps (notifications, metadata) {
  const emailNotificationProps = notifications.map(notification => {
    const mapNotification = notificationResponseMap[notification.type]
    return mapNotification(notification, metadata)
  })
  return emailNotificationProps
}

// TODO (DM) - unify this with the email messages
const pushNotificationMessagesMap = {
  [notificationTypes.Favorite.base] (notification) {
    const [user] = notification.users
    return `${user.name} favorited your ${notification.entity.type.toLowerCase()} ${notification.entity.name}`
  },
  [notificationTypes.Repost.base] (notification) {
    const [user] = notification.users
    return `${user.name} reposted your ${notification.entity.type.toLowerCase()} ${notification.entity.name}`
  },
  [notificationTypes.Follow] (notification) {
    const [user] = notification.users
    return `${user.name} followed you`
  },
  [notificationTypes.Announcement.base] (notification) {
    return notification.text
  },
  [notificationTypes.Milestone] (notification) {
    if (notification.entity) {
      const entity = notification.entity.type.toLowerCase()
      return `Your ${entity} ${notification.entity.name} has reached over ${notification.value} ${notification.achievement}s`
    } else {
      return `You have reached over ${notification.value} Followers `
    }
  },
  [notificationTypes.Create.base] (notification) {
    const [user] = notification.users
    const type = notification.entity.type.toLowerCase()
    if (notification.entity.type === actionEntityTypes.Track && !isNaN(notification.entity.count) && notification.entity.count > 1) {
      return `${user.name} released ${notification.entity.count} new ${type}s`
    }
    return `${user.name} released a new ${type} ${notification.entity.name}`
  }
}

module.exports = {
  formatNotificationProps,
  notificationResponseMap,
  notificationResponseTitleMap,
  pushNotificationMessagesMap
}
