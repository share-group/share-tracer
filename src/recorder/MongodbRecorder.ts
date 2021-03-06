import * as _ from 'lodash'
import {MongoClient, ObjectId} from 'mongodb'
import * as os from 'os'
import {getAppName, safeParse, timeFormat} from '../lib'

export interface IMongodbRecorderModel {
  requestId: string
  application: string
  machine: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'
  type: 'in' | 'out'
  headers?: any
  hostname?: string
  remoteIp?: string
  originUrl?: string
  url: string
  status: number
  query?: any
  body?: any
  response?: any
  requestTime: number
  duration: number
}

const mongodbRecorderModelIndex = [
  {application: 1},
  {requestTime: 1},
  {requestId: 1},
  {originUrl: 1},
  {hostname: 1},
  {status: 1}
]

export class MongodbRecorder {
  private client: MongoClient
  private url: string
  private dbName: string
  private appName: string
  private logger: any
  private indexes?: any[]

  constructor(url: string, logger: any, indexes?: any[]) {
    this.url = url
    this.logger = logger
    this.indexes = indexes
    this._connect()
  }

  run(data?: any): void {
    if (!this.client) {
      this._connect()
    }
    const db = this.client.db(this.dbName)
    const collection = db.collection(this._collectionName())
    const indexes = mongodbRecorderModelIndex.concat(this.indexes)
    indexes.forEach(v => collection.createIndex(v, {background: true}))
    collection.insertMany(this._parse(data))
  }

  private _connect(): void {
    const self = this
    MongoClient.connect(self.url, {useNewUrlParser: true, useUnifiedTopology: true}, (err, client) => {
      self.client = client
      self.dbName = self._dbName(self.url)
      self.appName = getAppName()
      if (_.isEmpty(err)) {
        self.logger.info(`${getAppName()}'s tracer connect to ${self.url} success...`)
      } else {
        self.logger.error(`${getAppName()}'s tracer connect to ${self.url} error:`, err)
      }

      self.client.on('close', () => {
        self.logger.warn('mongodb server closed ...')
        self._connect()
      })
    })
  }

  private _dbName(url: string): string {
    const lastIndexSlash = url.lastIndexOf('/') + 1
    const lastIndexFactor = url.lastIndexOf('?')

    if (lastIndexFactor > 0) {
      return url.substring(lastIndexSlash, lastIndexFactor).trim()
    }

    return url.substr(lastIndexSlash).trim()
  }

  private _collectionName(): string {
    return `Log_${timeFormat('yyyyMM')}`
  }

  private _parse(data?: any): IMongodbRecorderModel[] {
    const list = [] as IMongodbRecorderModel[]
    const requestId = ObjectId().toString()
    for (const span of data.spans) {
      const [originUrl] = _.remove(span.logs, v => v.fields[0].key === 'originUrl')
      const [query] = _.remove(span.logs, v => v.fields[0].key === 'query') || [{}]
      const [body] = _.remove(span.logs, v => v.fields[0].key === 'data') || [{}]
      const [response] = _.remove(span.logs, v => v.fields[0].key === 'response') || [{}]
      list.push(this._protected(_.pickBy({
        requestId,
        application: this.appName,
        machine: os.hostname(),
        method: span.tags['http.method'].value.toUpperCase().trim(),
        type: span.name === 'http-client' ? 'out' : 'in',
        headers: span.tags['http.headers'] ? span.tags['http.headers'].value : undefined,
        originUrl: originUrl ? originUrl.fields[0].value.trim() : undefined,
        url: (span.tags['http.url'] || span.tags['http.path']).value.trim(),
        hostname: span.tags['http.hostname'] ? span.tags['http.hostname'].value.trim() : undefined,
        remoteIp: span.tags['http.remote_ip'] ? span.tags['http.remote_ip'].value.trim() : undefined,
        query: query ? safeParse(query.fields[0].value) : undefined,
        body: body ? safeParse(body.fields[0].value) : undefined,
        response: response ? safeParse(response.fields[0].value) : undefined,
        status: span.tags['http.status_code'] ? parseInt(span.tags['http.status_code'].value) : undefined,
        requestTime: parseInt(span.timestamp),
        duration: parseInt(span.duration)
      }, _.identity)))
    }
    return list
  }

  _protected(data: any): any {
    if (data.query && data.query.password) {
      Object.assign(data.query, {password: '******'})
    }
    if (data.body && data.body.password) {
      Object.assign(data.body, {password: '******'})
    }
    return data
  }
}
