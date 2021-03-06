import * as _ from 'lodash'
import {safeParse, Logger as defaultLogger} from '../lib'

export class LoggerRecorder {
  private logger?: any

  constructor(logger?: any) {
    this.logger = logger || defaultLogger
  }

  run(data?: any): void {
    const span = _.find(data.spans, v => v.name === 'http')
    const method = span.tags['http.method'] ? span.tags['http.method'].value.toUpperCase().trim() : 'unknow'
    const url = span.tags['http.url'] ? span.tags['http.url'].value.trim() : ''
    const status = span.tags['http.status_code'] ? parseInt(span.tags['http.status_code'].value) : 0
    const duration = parseInt(span.duration)

    const [_query] = _.remove(span.logs, v => v.fields[0].key === 'query') || [{}]
    const [_body] = _.remove(span.logs, v => v.fields[0].key === 'data') || [{}]
    const [_response] = _.remove(span.logs, v => v.fields[0].key === 'response') || [{}]

    const query = _query ? safeParse(_query.fields[0].value) : {}
    const body = _body ? safeParse(_body.fields[0].value) : {}
    const response = _response ? safeParse(_response.fields[0].value) : {}

    this.logger.trace(`request url: ${url}`)
    this.logger.trace(`request method: ${method}`)
    this.logger.trace(`request: ${JSON.stringify(_.pickBy(Object.assign({}, query, body), _.identity))}`)
    this.logger.trace(`response, size: ${this._circulateSize(JSON.stringify(response).length)}, data: ${JSON.stringify(response)}`)
    this.logger.info(`${status} ${method} ${url} ${duration}ms`)
  }

  private _circulateSize(size) {
    const sizes = ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(size) / Math.log(1024))
    return `${Math.floor(size / (1024 ** i))} ${sizes[i]}`
  }
}
