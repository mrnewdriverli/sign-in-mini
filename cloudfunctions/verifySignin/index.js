// 云函数：核销签到 / 查看已核销列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 格式化时间
function formatDate(date) {
  if (!date) return ''
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
    // 如果是查询已核销列表
    if (event.action === 'list') {
      const res = await db.collection('signinRecords')
        .where({ isSigned: true })
        .orderBy('signinTime', 'desc')
        .limit(100)
        .get()

      const data = res.data.map(item => ({
        ...item,
        signinTimeStr: formatDate(item.signinTime)
      }))

      return { success: true, data }
    }

    // 核销操作：解析二维码数据
    let qrData
    try {
      qrData = JSON.parse(event.qrcodeData)
    } catch (e) {
      return { success: false, message: '二维码格式无效' }
    }

    const { id, token, timestamp } = qrData

    if (!id || !token || !timestamp) {
      return { success: false, message: '二维码数据不完整' }
    }

    // 验证二维码时效性（30 秒内有效，比原来的 10 秒更宽容）
    const now = Date.now()
    if (Math.abs(now - timestamp) > 30000) {
      return { success: false, message: '二维码已过期，请刷新后重试' }
    }

    // 查找签到记录（必须未核销 + token 匹配）
    const record = await db.collection('signinRecords')
      .where({
        _id: id,
        qrcodeToken: token,
        isSigned: false
      })
      .get()

    if (record.data.length === 0) {
      return { success: false, message: '无效二维码或已核销' }
    }

    // 更新签到状态
    await db.collection('signinRecords')
      .doc(id)
      .update({
        data: {
          isSigned: true,
          signinTime: db.serverDate()
        }
      })

    return {
      success: true,
      data: {
        name: record.data[0].name,
        department: record.data[0].department,
        phone: record.data[0].phone
      }
    }
  } catch (err) {
    console.error('verifySignin 错误:', err)
    return { success: false, message: '核销失败，请重试' }
  }
}
