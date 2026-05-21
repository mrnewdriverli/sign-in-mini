// 云函数：签到提交（校验动态 token）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 校验必填
    if (!event.name || !event.phone || !event.department) {
      return { success: false, message: '请填写完整信息' }
    }

    if (!event.token || !event.ts) {
      return { success: false, message: '请先扫描现场签到码' }
    }

    // 校验 token 时效（60 秒）
    const now = Date.now()
    if (Math.abs(now - event.ts) > 60000) {
      return { success: false, message: '签到码已过期，请重新扫码' }
    }

    // 检查同一 openid 是否已签到
    const existing = await db.collection('signinRecords')
      .where({ openid })
      .get()

    if (existing.data.length > 0) {
      return { success: false, message: '您已签到，无需重复签到' }
    }

    // 保存记录
    await db.collection('signinRecords').add({
      data: {
        name: event.name,
        phone: event.phone,
        department: event.department,
        openid,
        token: event.token,
        createTime: db.serverDate()
      }
    })

    return { success: true }
  } catch (err) {
    console.error('addSignin 错误:', err)
    return { success: false, message: '系统错误，请稍后重试' }
  }
}
