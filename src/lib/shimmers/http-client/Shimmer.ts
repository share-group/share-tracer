import {HttpClientShimmer} from 'pandora-hook'
import {ClientRequest} from 'http'
import {safeParse, query, getOriginUrl} from '../../Utils'
import {parse as parseQS} from 'querystring'

export class ShareHttpClientShimmer extends HttpClientShimmer {
  buildTags(args, request) {
    const options = args[0]
    return Object.assign({}, super.buildTags(args, request), {
      'http.headers': {
        value: options.headers,
        type: 'object'
      }
    })
  }

  buildTagsAndLog(args, _request, span) {
    const tags = this.buildTags(args, _request)
    span.addTags(tags)
    span.log({query: query({url: _request.path})})
    span.log({originUrl: getOriginUrl(_request)})
    span.log({data: args[0].body})
  }

  httpRequestWrapper = (request) => {
    const self = this
    const traceManager = this.traceManager
    const options = self.options

    return function wrappedHttpRequest(this: ClientRequest) {
      const tracer = traceManager.getCurrentTracer()
      let args = Array.from(arguments)

      if (!tracer) {
        return request.apply(this, args)
      }

      const span = self.createSpan(tracer)

      if (!span) {
        return request.apply(this, args)
      }

      if ((options as any).remoteTracing) {
        args = self.remoteTracing(args, tracer, span)
      }

      const _request = request.apply(this, args)
      self.buildTagsAndLog(args, _request, span)

      self.wrapRequest(_request, tracer, span)

      return _request
    }
  }

  handleResponse(tracer, span, res) {
    const traceManager = this.traceManager
    const shimmer = this.shimmer
    const self = this
    const recordResponse = this.options.recordResponse
    const bufferTransformer = this.options.bufferTransformer || self.bufferTransformer

    res.__responseSize = 0
    res.__chunks = []

    shimmer.wrap(res, 'emit', function wrapResponseEmit(emit) {
      const bindResponseEmit = traceManager.bind(emit)

      return function wrappedResponseEmit(this: ClientRequest, event) {
        if (event === 'end') {
          if (span) {

            if (recordResponse) {
              const response = bufferTransformer(Buffer.concat(res.__chunks.map(v => Buffer.from(v))), res)
              span.log({
                response
              })
            }

            span.error(false)

            self._responseEnd(res, span)

            tracer.setCurrentSpan(span)
            span.finish()
            self._finish(res, span)
          }
        } else if (event === 'data') {
          const chunk = arguments[1] || []
          res.__responseSize += chunk.length

          if (recordResponse) {
            res.__chunks.push(chunk)
          }
        }

        return bindResponseEmit.apply(this, arguments)
      }
    })
  }

  wrapRequest = (request, tracer, span) => {
    const traceManager = this.traceManager
    const shimmer = this.shimmer
    const self = this

    request.once('error', (res) => {
      self.handleError(span, res)
    })
    request.once('response', (res) => {
      self.handleResponse(tracer, span, res)
    })

    /**
     * 结束发送请求。 如果部分请求主体还未被发送，则会刷新它们到流中。 如果请求是分块的，则会发送终止字符 '0\r\n\r\n'。
     * 如果指定了 data，则相当于调用 request.write(data, encoding) 之后再调用 request.end(callback)。
     * 见：http://nodejs.cn/api/http.html#http_request_end_data_encoding_callback
     */
    shimmer.wrap(request, 'end', function requestWriteWrapper(write) {
      const bindRequestWrite = traceManager.bind(write)

      return function wrappedRequestWrite(this: ClientRequest, data, encoding) {
        if (dataTypeFilter(data, encoding)) {
          handleBody(span, data)
        }
        return bindRequestWrite.apply(this, arguments)
      }
    })

    function dataTypeFilter(chunk, encoding) {
      const hasChunk = chunk && typeof(chunk) === 'string'
      const isUtf8 = encoding === undefined || encoding === 'utf8' // default is utf8
      return (hasChunk && isUtf8)
    }

    function handleBody(this: any, span, chunk) {
      if (span) {
        span.log({
          data: parseQS(chunk) || safeParse(chunk)
        })
      }
    }
  }
}