import { userAccount } from '/src/js/api'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
dayjs.locale('zh-cn')

/**
 * 检查登录状态，并获取用户信息
 */
const checkLogin = async (user) => {
    let resp = await userAccount()
    if (resp.account && resp.profile) {
        user.id = resp.account.id
        user.name = resp.profile.nickname
        user.avatar = resp.profile.avatarUrl
        if (resp.profile.gender && resp.profile.birthday) {
            user.gender = resp.profile.gender
            let birthday = dayjs(resp.profile.birthday)
            let years = birthday.format('YY').substring(0, 1) + '0 后'
            let age = birthday.diff(Date.now(), 'year') * -1
            let call = (age < 30 ? '小' : user.gender == 1 ? '老' : '大') + (user.gender == 1 ? '哥哥' : '姐姐')
            user.profile = `${age} 岁的 ${years} ${call} 一枚`
        } else {
            user.gender = 0
            user.profile = ''
        }
        //登录成功之后记录一下当前用户登录cookie到缓存，便于浏览器清除cookie之后 还能快速登录 或者支持多账号登录
        await storeCurrenUser(user)
        return true
    }
    Object.assign(user, {
        id: null,
        avatar: '',
        name: '',
        profile: '',
        gender: 0
    })
    return false
}

/**
 * 保存当前cookie对应的用户信息至缓存
 */
const storeCurrenUser = async (user) => {
    //获取 localStorage 中历史用户列表
    let users = JSON.parse(localStorage?.userList ?? '[]')
    //获取当前登录的用户信息
    let { id, name, avatar } = user
    //去重
    users.forEach((usr, idx, arr) => usr.id == id && arr.splice(idx, 1))
    //将当前用户保存至列表内
    users.unshift({ id, name, avatar })
    //写入缓存
    localStorage.userList = JSON.stringify(users)

    //获取当前登录用户的所有 cookie 信息
    let cookies = await cookieOps('getAll', { domain: 'music.163.com', path: '/' })
    //过滤出仅需要的 cookie 信息 并写入缓存
    let usefulCookie = cookies
        .filter(c => c.path == '/' && ['music.163.com', '.music.163.com'].includes(c?.domain ?? '-'))
        .map(c => {
            let { domain, expirationDate, httpOnly, name, path, sameSite, secure, storeId, value } = c
            return { domain, expirationDate, httpOnly, name, path, sameSite, secure, storeId, value, url: 'https://music.163.com' }
        })
    localStorage['userCookie-' + user.id] = JSON.stringify(usefulCookie)
    return usefulCookie
}

/**
 * 切换用户：保存当前用户的登录信息至缓存，并登出当前用户（便于切换另外一个账号登录）
 */
const switchUser = async (user) => {
    //获取当前登录的cookie
    const userCookie = await storeCurrenUser(user)
    //执行remove cookie
    await Promise.all(userCookie.map(async cookie => {
        let { name, url } = cookie
        return cookieOps('remove', { name, url })
    }))
    //登出用户
    Object.assign(user, {
        id: null,
        avatar: '',
        name: '',
        profile: '',
        gender: 0
    })
}

/**
 * 恢复一个账号的登录状态，如果恢复失败则从历史缓存列表中清除当前用户
 */
const resumeUser = async (currUser, assignUserId) => {
    await Promise.all(JSON.parse(localStorage[`userCookie-${assignUserId}`] || '[]').map(async cookie => cookieOps('set',cookie)))
    let check = await checkLogin(currUser)
    check || delUser(assignUserId)
    return check
}

const userList = (currUid) => {
    let users = JSON.parse(localStorage.userList || '[]')
    users.forEach((usr, idx, arr) => usr.id == currUid && arr.splice(idx, 1))
    return users
}


const delUser = uid => {
    //删除 localStorage 中历史指定用户缓存
    localStorage.removeItem(`userCookie-${uid}`)
    //获取 localStorage 中历史用户列表
    let users = JSON.parse(localStorage.userList || '[]')
    //删除要恢复的用户信息
    users.forEach((usr, idx, arr) => usr.id == uid && arr.splice(idx, 1))
    //写入缓存
    if (users.length > 0) {
        localStorage.userList = JSON.stringify(users)
    } else {
        //如果都没有用户了 那就清理本地缓存
        localStorage.removeItem('userList')
    }
}

/**
 * 兼容Firefox MV2
 */
const cookieOps = (method, opt) => {
    if (/Firefox/.test(navigator.userAgent)) {
        //Firefox 暂不支持 mv3 需要用 callback
        return new Promise((resolve, reject) => {
            browser.cookies[method](opt, data => resolve(data))
        })
    } else {
        //chrome 和 Edge 支持 mv3 支持直接返回 promise
        return chrome.cookies[method](opt)
    }
}


export { checkLogin, switchUser, resumeUser, delUser, userList }