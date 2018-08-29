import {HttpClientPatcher as Base} from 'pandora-hook'
import {ShareHttpClientShimmer} from './shimmers/http-client/Shimmer'

export class HttpClientPatcher extends Base {
  constructor(options?) {
    super(Object.assign({
      shimmerClass: ShareHttpClientShimmer
    }, options))
  }
}