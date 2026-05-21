// 云函数：查询签到列表 / 导出 CSV
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 分页获取全部记录
async function getAll(collection) {
  const MAX = 100
  const countRes = await collection.count()
  const total = countRes.total
  if (total === 0) return []
  const batches = Math.ceil(total / MAX)
  const tasks = []
  for (let i = 0; i < batches; i++) {
    tasks.push(collection.orderBy('createTime', 'desc').skip(i * MAX).limit(MAX).get())
  }
  const results = await Promise.all(tasks)
  return results.reduce((a, c) => a.concat(c.data), [])
}

// 格式化时间
function fmt(d) {
  if (!d) return ''
  const t = new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

exports.main = async (event, context) => {
  try {
    const data = await getAll(db.collection('signinRecords'))

    // 列表查询
    if (event.action !== 'export') {
      const list = data.map(item => ({
        ...item,
        timeStr: fmt(item.createTime)
      }))
      return { success: true, data: list, count: data.length }
    }

    // CSV 导出
    const BOM = '﻿' // UTF-8 BOM
    const header = '序号,姓名,手机号,部门,签到时间\n'
    const rows = data.map((item, i) => [
      i + 1,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.phone || '').replace(/"/g, '""')}"`,
      `"${(item.department || '').replace(/"/g, '""')}"`,
      `"${fmt(item.createTime)}"`
    ].join(',')).join('\n')

    const csv = BOM + header + rows
    const buffer = Buffer.from(csv, 'utf-8')

    const upload = await cloud.uploadFile({
      cloudPath: `exports/signin-${Date.now()}.csv`,
      fileContent: buffer
    })

    const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] })

    return {
      success: true,
      fileID: upload.fileID,
      downloadUrl: urlRes.fileList[0].tempFileURL,
      count: data.length
    }
  } catch (err) {
    console.error('exportExcel 错误:', err)
    return { success: false, message: '操作失败，请重试' }
  }
}
