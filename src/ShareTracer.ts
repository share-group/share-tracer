import * as assert from 'assert'
import * as _ from 'lodash'
import {EnvironmentUtil} from 'pandora-env'
import {getAppName, DefaultEnvironment, HttpClientPatcher, HttpServerPatcher, Logger as defaultLogger} from './lib'
import {LoggerRecorder, MongodbRecorder} from './recorder'

export interface ShareTracerOptions {
  // mongodb记录
  mongodb?: {
    enable?: boolean
    url?: string
  }

  // logger输出
  logger?: {
    enable?: boolean
    instance?: any
  }

  // 表索引定义
  indexes?: any[]
}

export class ShareTracer {
  private options: ShareTracerOptions

  constructor(options?: ShareTracerOptions) {
    if (options.mongodb.enable) assert(options.mongodb.url, '"mongodb.url" must given')
    this.options = options
    EnvironmentUtil.getInstance().setCurrentEnvironment(new DefaultEnvironment())
    this._logger(`${getAppName()}'s tracer init success...`)
  }

  run() {
    new HttpServerPatcher({recordGetParams: true, recordPostData: true, recordUrl: true}).run()
    new HttpClientPatcher({recordResponse: true}).run()

    this._useMongodbRecorder()
    this._useLoggerRecorder()
  }

  private _useMongodbRecorder() {
    if (!this.options.mongodb.enable) return
    const logger = this.options.logger.instance || defaultLogger
    const indexes = this.options.indexes || []
    const mongodbRecorder = new MongodbRecorder(
      this.options.mongodb.url,
      logger,
      indexes
    )
    process.on('PANDORA_PROCESS_MESSAGE_TRACE' as any, (tracer: any) => {
      mongodbRecorder.run(_.cloneDeep(tracer))
    })
  }

  private _useLoggerRecorder() {
    if (!this.options.logger.enable) return
    const loggerRecorder = new LoggerRecorder(this.options.logger.instance)
    process.on('PANDORA_PROCESS_MESSAGE_TRACE' as any, (tracer: any) => {
      loggerRecorder.run(_.cloneDeep(tracer))
    })
  }

  private _logger(...args: any[]) {
    if (!this.options.logger.enable) return
    const logger = this.options.logger.instance || defaultLogger
    logger.info(...args)
  }
}