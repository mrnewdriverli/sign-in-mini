// 云函数：提交签到信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 生成唯一 token
function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 校验必填字段
    if (!event.name || !event.phone || !event.department) {
      return { success: false, message: '请填写完整信息' }
    }

    // 检查是否已签到（同一 openid 只能签到一次）
    const existing = await db.collection('signinRecords')
      .where({ openid })
      .get()

    if (existing.data.length > 0) {
      return { success: false, message: '你已完成签到，无需重复提交' }
    }

    // 生成唯一 token，用于二维码校验
    const token = generateToken()

    // 保存签到信息
    const result = await db.collection('signinRecords').add({
      data: {
        name: event.name,
        phone: event.phone,
        department: event.department,
        openid,
        createTime: db.serverDate(),
        signinTime: null,
        isSigned: false,
        qrcodeToken: token
      }
    })

    return {
      success: true,
      id: result._id,
      token
    }
  } catch (err) {
    console.error('addSignin 错误:', err)
    return { success: false, message: '系统错误，请稍后重试' }
  }
}
