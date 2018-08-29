import * as fs from 'fs'
import * as path from 'path'
import * as qs from 'querystring'
import * as parse from 'parseurl'

export function getAppPath() {
  return path.resolve(`${process.mainModule.paths[1]}${path.sep}..`).trim()
}

export function getAppName() {
  const packageFile = `${getAppPath()}/package.json`
  const appPkg = fs.existsSync(packageFile) ? require(packageFile) : {name: 'nodejs-application'}
  return appPkg.name
}

export function safeParse(str) {
  try {
    return JSON.parse(str)
  } catch (e) {
    return str
  }
}

export function timeFormat(_format = 'yyyy-MM-dd hh:mm:ss' as string) {
  let format = _format
  const date = new Date()
  const o = {
    'M+': date.getMonth() + 1, // 月份
    'd+': date.getDate(), // 日
    'h+': date.getHours(), // 小时
    'm+': date.getMinutes(), // 分
    's+': date.getSeconds(), // 秒
    'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
    'S': date.getMilliseconds() // 毫秒
  }
  format = /(y+)/.test(format) ? format.replace(RegExp.$1, (`${date.getFullYear()}`).substr(4 - RegExp.$1.length)) : format
  Object.keys(o).filter((k) => {
    format = new RegExp(`(${k})`).test(format) ? format.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : ((`00${o[k]}`).substr((`${o[k]}`).length))) : format
    return true
  })
  return format
}

function querystring(req) {
  if (!req) return ''
  return parse(req).query || ''
}

export function query(req) {
  const str = querystring(req)
  const c = this._querycache || {}
  return c[str] || (c[str] = qs.parse(str))
}

export function getOriginUrl(req) {
  const indexFactor = req.path.indexOf('?')
  if (indexFactor <= -1) {
    return req.path
  }
  return req.path.substr(0, indexFactor)
}