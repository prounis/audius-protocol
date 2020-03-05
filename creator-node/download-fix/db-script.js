const fs = require('fs')

const initDB = require('./db.js')

const timeout = async (ms) => {
  console.log(`starting timeout of ${ms}`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

const run = async () => {
  // const dbUrlLocal = "postgres://postgres:postgres@localhost:4432/audius_creator_node"
  const dbUrl1 = 'postgres://postgres:postgres@stage-creator-1.c2xpmy12b95w.us-west-2.rds.amazonaws.com:5432/audius_creator_node'
  const dbUrl2 = 'postgres://postgres:postgres@stage-creator-2.c2xpmy12b95w.us-west-2.rds.amazonaws.com:5432/audius_creator_node'
  const dbUrl3 = 'postgres://postgres:postgres@stage-creator-3.c2xpmy12b95w.us-west-2.rds.amazonaws.com:5432/audius_creator_node'
  
  const models1 = await initDB(dbUrl1)
  const models2 = await initDB(dbUrl2)
  const models3 = await initDB(dbUrl3)

  const filePath = '/Users/sid/Documents/Audius/code/audius/sid-test/download-fix/staging/cn2-transcode-output.txt'
  const data = fs.readFileSync(filePath, 'utf8').split('\n')

  let i = 0
  for(const d of data) {
    i++
    if (i < 14) continue

    let [sourcefile, cnodeUserUUID, trackUUID, multihash, dstPath] = d.split(' || ')
    sourcefile = sourcefile.split(': ')[1]
    cnodeUserUUID = cnodeUserUUID.split(': ')[1]
    trackUUID = trackUUID.split(': ')[1]
    multihash = multihash.split(': ')[1]
    dstPath = dstPath.split(': ')[1]
    console.log(`\n\n\n\nPROCESSING ROW #${i}: sourcefile: ${sourcefile}, cnodeUserUUID: ${cnodeUserUUID}, trackUUID: ${trackUUID}, multihash: ${multihash}, dstPath: ${dstPath}`)

    if (!sourcefile || !cnodeUserUUID || !trackUUID || !multihash || !dstPath) {
      console.log('ABORT')
      process.exit(1)
    }
    
    /** save file to db */
    const queryObj = {
      where: {
        cnodeUserUUID: cnodeUserUUID,
        multihash: multihash,
        sourceFile: sourcefile,
        storagePath: dstPath,
        type: 'copy320',
        trackUUID: trackUUID
      }
    }
    
    let resp
    
    try {
      console.log(`writing to db1...`)
      resp = (await models1.File.findOrCreate(queryObj))[0].dataValues
      console.log(resp)
    } catch (e) {
      console.log(e)
    }
    try {
      console.log(`writing to db2...`)
      resp = (await models2.File.findOrCreate(queryObj))[0].dataValues
      console.log(resp)
    } catch (e) {
      console.log(e)
    }
    try {
      console.log(`writing to db3...`)
      resp = (await models3.File.findOrCreate(queryObj))[0].dataValues
      console.log(resp)
    } catch (e) {
      console.log(e)
    }
  }


  console.log('Exiting...')
  process.exit(0)
}
run()
