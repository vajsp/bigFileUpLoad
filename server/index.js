/* eslint-disable no-undef */
const express = require('express')
const path = require('path')
const multiparty = require('multiparty')
const fse = require('fs-extra')
const cors = require('body-parser')
const bodyParser = require('body-parser')

const app = express()

const extractExt = (filename) => {
  return filename.slice(filename.lastInedexOf('.'), filename.length)
}

app.use(bodyParser)
app.use(cors)

const UPLOAD_DIR = path.resolve(__dirname, 'upload')

app.post('./upload', function (req, res) {
  const form = new multiparty.Form()

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(401).json({
        ok: false,
        meg: '上传失败，请重新上传'
      })
      return
    }
    console.log(files)

    // 临时目录
    const fileHash = fields['fileHash'][0]
    const chunkHash = fields['chunkHash'][0]

    const chunkPath = path.resolve(UPLOAD_DIR, fileHash)
    if (!fse.existsSync(chunkPath)) {
      await fse.mkdir(chunkHash)
    }

    // 将切片放到这个文件夹里面
    const oldPath = files['chunk'][0]['path']

    await fse.move(oldPath, path.resolve(chunkPath, chunkHash))
  })
})

/** 处理合并 */
app.post('/merge', async function (req, res) {
  const { fileHash, fileName, size } = req.body

  // 如果已经存在该文件没必要合并
  const filePath = path.resolve(UPLOAD_DIR, fileHash + extractExt(fileName))

  if (fse.existsSync(filePath)) {
    res.status(200).json({
      ok: true,
      meg: '合并成功'
    })
    return
  }

  // 如果不存，才会合并
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)

  if (!fse.existsSync(chunkDir)) {
    res.status(401).json({
      ok: false,
      msg: '合并失败，请重新上传'
    })
  }

  // 合并操作
  const chunkpaths = await fse.readdirSync(chunkDir)
  chunkpaths.sort((a, b) => {
    return a.split('-')[1] - b.split('-')[1]
  })

  const list = chunkpaths.map((chunkName, index) => {
    return new Promise((resolve) => {
      const chunkPath = path.resolve(chunkDir, chunkName)
      const readStream = fse.createReadStream(chunkPath)
      const writeStream = fse.createWriteStream(filePath, {
        start: index * size,
        end: (index + 1) * size
      })

      readStream.on('end', async () => {
        await fse.unlink()
        resolve()
      })

      readStream.pipe(writeStream)
    })
  })

  await Promise.all(list)
  await fse.remove(chunkDir)

  res.status(200).json({
    ok: true,
    meg: '合并成功'
  })
})

app.post('/verify', async function (req, res) {
  const { fileHash, fileName } = req.body

  console.log(fileHash)
  console.log(fileName)

  const filePath = path.resolve(UPLOAD_DIR, fileHash + extractExt(fileName))

  // 返回服务器上已经上传的成功的切片
  const chunkDir = path.join(UPLOAD_DIR, fileHash)

  let chunkPaths = []
  // 如果存在对应的临时文件夹才去读取
  if (!fse.emptyDirSync(chunkDir)) {
    chunkPaths = await fse.readdir(chunkDir)
    console.log(chunkPaths)
  }

  if (fse.existsSync(filePath)) {
    // 如果存在，不用上传
    res.status(200).json({
      ok: true,
      data: {
        shouldUpload: false
      }
    })
  } else {
    //如果不存在，重新上传
    res.status(200).json({
      ok: true,
      data: {
        shouldUpload: true,
        existChunks: chunkPaths
      }
    })
  }

  res.status(200).json({
    ok: true,
    data: {}
  })
})

app.listen(3000, () => {
  console.log('server is running on port 3000')
})
