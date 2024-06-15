<script setup lang="ts">
import SparkMD5 from 'spark-md5'
import { ref } from 'vue'

// 1MB = 1024KB = 1024*1024
const CHUNK_SIZE = 1024 * 1024
const fileHash = ref<string>('')
const fileName = ref<string>('')

// 文件分片
const createChunks = (file: File) => {
  let cur = 0
  let chunks = []

  while (cur < file.size) {
    const blob = file.slice(cur, cur + CHUNK_SIZE)
    chunks.push(blob)

    cur += CHUNK_SIZE
  }

  return chunks
}

/** 通知服务器合并文件请求 */
const mergeRequset = () => {
  fetch('http://localhost:3000/merge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fileHash: fileHash.value,
      fileName: fileName.value,
      size: CHUNK_SIZE
    })
  }).then((res) => {
    console.log('合并成功')
  })
}

const upLoadChunks = async (chunks: Blob[], existChunks: string[]) => {
  const data = chunks.map((chunk, index) => {
    return {
      fileHash: fileHash.value,
      chunkHash: fileHash.value + '_' + index,
      chunk
    }
  }) as any

  const formDatas = data
    .filter((item) => {
      return !existChunks.includes(item.chunkHash)
    })
    .map((item) => {
      const formData = new FormData()

      formData.append('fileHash', item.fileHash)
      formData.append('chunkHash', item.chunkHash)
      formData.append('chunk', item.chunk)

      return formData
    })

  console.log(formDatas)
  const max = 6 //最大并发请求数
  let index = 0
  const taskPool = [] //请求池

  while (index < formDatas.length) {
    const task = fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formDatas[index]
    })

    task.then(() => {
      taskPool.splice(
        taskPool.findIndex((item: any) => {
          return item === task
        })
      )
    })

    taskPool.push(task)
    if (taskPool.length === max) {
      await Promise.race(taskPool)
    }
    index++
  }

  await Promise.all(taskPool)

  // 通知服务器去合并文件
  mergeRequset()
}

/** 计算hash值 */
const calculateHash = (chunks: Blob[]) => {
  return new Promise((resolve) => {
    // 1.第一个和最后一个切片全部参与计算
    // 2.中间的切片只计算前面两个字节、中间两个字节、最后两个字节
    const targets: Blob[] = [] // 存储所有参与计算的切片
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    chunks.forEach((chunk, index) => {
      if (index === 0 || index === chunks.length - 1) {
        // 1.第一个和最后一个切片全部参与计算
        targets.push(chunk)
      } else {
        // 2.中间的切片只计算钱两个字节、中间两个字节、最后两个字节
        targets.push(chunk.slice(0, 2)) //前两个字节
        targets.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2)) // 中间两个字节
        targets.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE)) // 最后两个字节
      }
    })

    fileReader.readAsArrayBuffer(new Blob(targets))
    fileReader.onloadend = (e) => {
      spark.append(e.target.result)
      // console.log(spark.end())
      resolve(spark.end())
    }
  })
}

const verifyHash = () => {
  return fetch('http://localhost:3000/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fileHash: fileHash.value,
      fileName: fileName.value
    })
  })
    .then((res) => {
      console.log('verifyHash成功')
      return res.json
    })
    .then((res) => {
      return res
    })
}

const handleUpload = async (e) => {
  const files = e.target.files
  if (!files) {
    return
  }

  // 读取文件
  console.log(files[0])
  fileName.value = files[0].name

  // 文件分片
  const chunks = createChunks(files[0])
  console.log(chunks)

  // hash计算
  const hash = (await calculateHash(chunks)) as any
  console.log(hash)
  fileHash.value = hash

  // 校验hash 值
  const data = (await verifyHash()) as any
  console.log(data)
  if (!data.data.shouldUpload) {
    alert('秒传成功')
    return
  }

  // 上传分片
  upLoadChunks(hash, data.data.existChunks)
}
</script>

<template>
  <div class="greetings">
    <h1 class="green">大文件上传</h1>
    <input type="file" @change="handleUpload" />
  </div>
</template>

<style scoped>
</style>
