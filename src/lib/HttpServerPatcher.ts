import {IncomingMessage} from 'http'
import {HttpServerPatcher as Base} from 'pandora-hook'
import {ParsedUrlQuery} from 'querystring'
import {safeParse} from './Utils'

export class HttpServerPatcher extends Base {
  buildTags(req) {
    return Object.assign({}, super.buildTags(req), {
      'http.headers': {
        value: req.headers,
        type: 'object'
      }
    })
  }

  bufferTransformer(buffer, req?: IncomingMessage): ParsedUrlQuery | string {
    try {
      return buffer.toString('utf8')
    } catch (error) {
      return ''
    }
  }

  /**
   * 放在 class 这一层，方便子类替换实现
   * @param options
   * @param req
   * @param res
   * @param tracer
   * @param span
   */
  recordResponse(options, req, res, tracer, span) {
    const traceManager = this.getTraceManager()
    const shimmer = this.getShimmer()

    // 为了记录 res 参数 见 http://nodejs.cn/api/http.html#http_response_end_data_encoding_callback
    shimmer.wrap(res, 'write', (write) => {
      const bindRequestWrite = traceManager.bind(write)
      return function wrappedResponseWrite(chunk, encoding, callback) {
        responseLog(res, chunk, encoding)
        return bindRequestWrite.apply(this, arguments)
      }
    })

    shimmer.wrap(res, 'end', (write) => {
      const bindRequestWrite = traceManager.bind(write)
      return function wrappedResponseWrite(chunk, encoding, callback) {
        responseLog(res, chunk, encoding)
        return bindRequestWrite.apply(this, arguments)
      }
    })

    function responseLog(response, chunk, encoding) {
      if (contentTypeFilter(response) && dataTypeFilter(chunk, encoding)) {
        handleResponse(span, chunk)
      }
    }

    /**
     * 未指定 contentType 或者 contentType 包含 text or json
     * @param response
     * @returns {boolean}
     */
    function contentTypeFilter(response) {
      const contentType = response.getHeader('content-type')
      return !contentType || contentType.indexOf('text') > -1 || contentType.indexOf('json') > -1
    }

    function dataTypeFilter(chunk, encoding) {
      const hasChunk = chunk && typeof (chunk.toString('utf8').trim()) === 'string'
      const isUtf8 = encoding === undefined || encoding === 'utf8' // default is utf8
      return (hasChunk && isUtf8)
    }

    function handleResponse(span, chunk) {
      const response = safeParse(chunk)
      span.log({
        response
      })
    }
  }

  /**
   * 放在 class 这一层，方便子类替换实现
   * @param options
   * @param req
   * @param res
   * @param tracer
   * @param span
   */
  recordQuery(options, req, res, tracer, span) {
    const query = this.processGetParams(req)
    span.log({
      query
    })
  }

  /**
   * 放在 class 这一层，方便子类替换实现
   * @param options
   * @param req
   * @param res
   * @param tracer
   * @param span
   */
  recordPostData(options, req, res, tracer, span) {
    const self = this
    const traceManager = this.getTraceManager()
    const shimmer = this.getShimmer()
    let chunks = []
    if (req.method && req.method.toUpperCase() === 'POST') {
      shimmer.wrap(req, 'emit', (emit) => {
        const bindRequestEmit = traceManager.bind(emit)

        return function wrappedRequestEmit(this: IncomingMessage, event) {
          if (event === 'data') {
            const chunk = arguments[1] || []

            chunks.push(chunk)
          }

          return bindRequestEmit.apply(this, arguments)
        }
      })
    }

    function onFinishedFactory(eventName) {
      return function onFinished() {
        res.removeListener('finish', onFinished)
        req.removeListener('aborted', onFinished)
        if (eventName !== 'aborted' && req.method && req.method.toUpperCase() === 'POST') {
          const transformer = options.bufferTransformer || self.bufferTransformer
          const postData = transformer(chunks)

          span.log({
            data: postData
          })
          // clear cache
          chunks = []
        }

        span.setTag('http.aborted', {
          type: 'bool',
          value: eventName === 'aborted'
        })

        self.beforeFinish(span, res)
        span.finish()
        tracer.finish(options)
        self.afterFinish(span, res)
      }
    }

    res.once('finish', onFinishedFactory('finish'))
    req.once('aborted', onFinishedFactory('aborted'))
  }

  /**
   * 如果要新增钩子，复写此方法，添加调用
   * super.wrapRequest()
   * this.newRecord(options, req, res, tracer, span)
   * @param options
   * @param req
   * @param res
   * @param tracer
   * @param span
   */
  wrapRequest(options, req, res, tracer, span) {
    this.recordQuery(options, req, res, tracer, span)
    this.recordPostData(options, req, res, tracer, span)
    this.recordResponse(options, req, res, tracer, span)
  }

  shimmer(options) {
    const self = this
    const traceManager = this.getTraceManager()
    const shimmer = this.getShimmer()
    shimmer.wrap(this.getModule(), 'createServer', (createServer) => {
      return function wrappedCreateServer(this: any, requestListener) {
        if (requestListener) {
          const listener = traceManager.bind((req, res) => {
            const requestFilter = options.requestFilter || self.requestFilter
            if (requestFilter(req)) {
              return requestListener(req, res)
            }

            traceManager.bindEmitter(req)
            traceManager.bindEmitter(res)

            const tracer = self.createTracer(req)
            self._beforeExecute(tracer, req, res)
            const tags = self.buildTags(req)
            const span = self.createSpan(tracer, tags)
            self.wrapRequest(options, req, res, tracer, span)
            span.log({originUrl: self.getFullUrl(req)})
            tracer.named(`HTTP-${tags['http.method'].value}:${tags['http.url'].value}`)
            tracer.setCurrentSpan(span)
            return requestListener(req, res)
          })

          return createServer.call(this, listener)
        }

        return createServer.call(this, requestListener)
      }
    })
  }

}