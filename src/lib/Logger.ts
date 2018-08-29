/* tslint:disable */
import {timeFormat} from './Utils'

class Logger {
  trace(...args: any[]) {
    const message = `${timeFormat('yyyy-MM-dd hh:mm:ss.S')} [trace]`
    console.info(message, ...args)
  }

  info(...args: any[]) {
    const message = `${timeFormat('yyyy-MM-dd hh:mm:ss.S')} [info]`
    console.info(message, ...args)
  }

  error(...args: any[]) {
    const message = `${timeFormat('yyyy-MM-dd hh:mm:ss.S')} [error]`
    console.error(message, ...args)
  }
}

export default new Logger()