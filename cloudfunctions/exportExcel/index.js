// 云函数：导出签到记录为 Excel
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 分页获取全部数据（突破 100 条限制）
async function getAllRecords(collection) {
  const MAX_LIMIT = 100
  const countResult = await collection.count()
  const total = countResult.total

  if (total === 0) return []

  const batchTimes = Math.ceil(total / MAX_LIMIT)
  const tasks = []

  for (let i = 0; i < batchTimes; i++) {
    tasks.push(
      collection.skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    )
  }

  const results = await Promise.all(tasks)
  return results.reduce((acc, cur) => acc.concat(cur.data), [])
}

// 格式化时间
function formatDate(date) {
  if (!date) return '未签到'
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

exports.main = async (event, context) => {
  try {
    const data = await getAllRecords(db.collection('signinRecords'))

    // 组装 CSV 格式（不依赖第三方库，兼容性更好）
    const BOM = '﻿' // UTF-8 BOM，确保 Excel 正确识别中文
    const header = '序号,姓名,手机号,部门,提交时间,签到时间,签到状态\n'
    const rows = data.map((item, index) => {
      return [
        index + 1,
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.phone || '').replace(/"/g, '""')}"`,
        `"${(item.department || '').replace(/"/g, '""')}"`,
        `"${formatDate(item.createTime)}"`,
        `"${formatDate(item.signinTime)}"`,
        `"${item.isSigned ? '已签到' : '未签到'}"`
      ].join(',')
    }).join('\n')

    const csvContent = BOM + header + rows
    const buffer = Buffer.from(csvContent, 'utf-8')

    // 上传到云存储
    const timestamp = Date.now()
    const cloudPath = `exports/signin-records-${timestamp}.csv`
    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    // 获取临时下载链接
    const urlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })

    return {
      success: true,
      fileID: uploadResult.fileID,
      downloadUrl: urlResult.fileList[0].tempFileURL,
      totalCount: data.length
    }
  } catch (err) {
    console.error('exportExcel 错误:', err)
    return { success: false, message: '导出失败，请重试' }
  }
}
