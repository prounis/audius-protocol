const fs = require('fs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const timeout = async (ms) => {
  console.log(`starting timeout of ${ms}`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

const run = async () => {
  // given path, cp file from one container to other
  const namespace = 'stage'
  
  const podCN1 = 'creator-1-backend-5d98f47c7f-7n52p'
  const podCN2 = 'creator-2-backend-774977f5c5-6sm8w'
  const podCN3 = 'creator-3-backend-6f48df689d-s9tfc'

  const filePath = '/Users/sid/Documents/Audius/code/audius/sid-test/download-fix/staging/cn1-transcode-output.txt'
  const data = fs.readFileSync(filePath, 'utf8').split('\n')

  const uniqueMultihashes = new Set()

  let i = 0
  for (const d of data) {
    i++
    if (i < 136) continue
    
    let [sourcefile, cnodeUserUUID, trackUUID, multihash, dstPath] = d.split(' || ')
    sourcefile = sourcefile.split(': ')[1]
    cnodeUserUUID = cnodeUserUUID.split(': ')[1]
    trackUUID = trackUUID.split(': ')[1]
    multihash = multihash.split(': ')[1]
    dstPath = dstPath.split(': ')[1]
    console.log(`PROCESSING ROW #${i}: ${sourcefile}, ${cnodeUserUUID}, ${trackUUID}, ${multihash}, ${dstPath}`)

    if (uniqueMultihashes.has(multihash)) {
      console.log(`duplicate multihash - ${multihash}. skipping`)
      continue
    } else {
      uniqueMultihashes.add(multihash)
    }

    const srcPodPath = dstPath
    const localPath = `/Users/sid/Documents/Audius/code/audius/audius-protocol/creator-node/download-fix/tmp/${multihash}`
    const dstPodPath = dstPath
    
    let cmd, obj

    if (!fs.existsSync(localPath)) {
      cmd = `kubectl cp ${namespace}/${podCN1}:${srcPodPath} ${localPath}`
      obj = await exec(cmd)
      console.log('stdout: ', obj['stdout'])
      console.log('stderr: ', obj['stderr'])
    } else {
      console.log(`skipping copy to local - file already exists at ${localPath}`)
    }

    cmd = `kubectl cp ${localPath} ${namespace}/${podCN2}:${dstPodPath}`
    obj = await exec(cmd)
    console.log('stdout: ', obj['stdout'])
    console.log('stderr: ', obj['stderr'])

    cmd = `kubectl cp ${localPath} ${namespace}/${podCN3}:${dstPodPath}`
    obj = await exec(cmd)
    console.log('stdout: ', obj['stdout'])
    console.log('stderr: ', obj['stderr'])

    await timeout(500)

    // remove file from local FS
    fs.unlinkSync(localPath)

    await timeout(1000)
  }
}
run()