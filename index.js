'use strict'

const assert = require('assert')
const debug = require('debug')('record')
const { spawn } = require('child_process')
const recorders = {
    arecord: (options) => {
        const cmd = 'arecord'

        const args = [
            '-q', // show no progress
            '-r', options.sampleRate, // sample rate
            '-c', options.channels, // channels
            '-t', options.audioType, // audio type
            '-f', 'S16_LE', // Sample format
            '-' // pipe
        ]

        if (options.device) {
            args.unshift('-D', options.device)
        }

        return { cmd, args }
    },
    rec: (options) => {
        const cmd = 'rec'

        let args = [
            '-q', // show no progress
            '-r', options.sampleRate, // sample rate
            '-c', options.channels, // channels
            '-e', 'signed-integer', // sample encoding
            '-b', '16', // precision (bits)
            '-t', options.audioType, // audio type
            '-' // pipe
        ]

        if (options.endOnSilence) {
            args = args.concat([
                'silence', '1', '0.1', options.thresholdStart || options.threshold + '%',
                '1', options.silence, options.thresholdEnd || options.threshold + '%'
            ])
        }

        return { cmd, args }
    },
    sox: (options) => {
        const cmd = 'sox'

        let args = [
            '--default-device',
            '--no-show-progress', // show no progress
            '--rate', options.sampleRate, // sample rate
            '--channels', options.channels, // channels
            '--encoding', 'signed-integer', // sample encoding
            '--bits', '16', // precision (bits)
            '--type', options.audioType, // audio type
            '-' // pipe
        ]

        if (options.endOnSilence) {
            args = args.concat([
                'silence', '1', '0.1', options.thresholdStart || options.threshold + '%',
                '1', options.silence, options.thresholdEnd || options.threshold + '%'
            ])
        }

        const spawnOptions = { shell: true }

        if (options.device) {
            args.splice(args.length - 3, 0, `--type waveaudio "${options.device}"`)
        } else {
            args.splice(0, 0, '--default-device');
        }

        return { cmd, args, spawnOptions }
    }
}

class Recording {
    constructor(options = {}) {
        const defaults = {
            cmd: 'sox',
            sampleRate: 16000,
            channels: 1,
            compress: false,
            threshold: 0.5,
            thresholdStart: null,
            thresholdEnd: null,
            silence: '1.0',
            recorder: 'sox',
            endOnSilence: false,
            audioType: 'wav'
        }

        if (!options.hasOwnProperty('cmd') && options.hasOwnProperty('recorder')) options.cmd = options.recorder;
        this.options = Object.assign(defaults, options)

        const recorder = recorders[this.options.recorder];
        const { args, spawnOptions = {} } = recorder(this.options);
        const cmd = options.cmd;

        this.cmd = cmd
        this.args = args
        this.cmdOptions = Object.assign({ encoding: 'binary', stdio: 'pipe' }, spawnOptions)

        debug(`Started recording`)
        debug(this.options)
        debug(` ${this.cmd} ${this.args.join(' ')}`)

        return this.start()
    }

    start() {
        const { cmd, args, cmdOptions } = this

        const cp = spawn(cmd, args, cmdOptions)
        const rec = cp.stdout
        const err = cp.stderr

        this.process = cp // expose child process
        this._stream = rec // expose output stream

        cp.on('close', code => {
            if (code === 0) return
            rec.emit('error', `${this.cmd} has exited with error code ${code}.

Enable debugging with the environment variable DEBUG=record.`
            )
        })

        err.on('data', chunk => {
            debug(`STDERR: ${chunk}`)
        })

        rec.on('data', chunk => {
            debug(`Recording ${chunk.length} bytes`)
        })

        rec.on('end', () => {
            debug('Recording ended')
        })

        return this
    }

    stop() {
        assert(this.process, 'Recording not yet started')

        this.process.kill()
    }

    pause() {
        assert(this.process, 'Recording not yet started')

        this.process.kill('SIGSTOP')
        this._stream.pause()
        debug('Paused recording')
    }

    resume() {
        assert(this.process, 'Recording not yet started')

        this.process.kill('SIGCONT')
        this._stream.resume()
        debug('Resumed recording')
    }

    isPaused() {
        assert(this.process, 'Recording not yet started')

        return this._stream.isPaused()
    }

    stream() {
        assert(this._stream, 'Recording not yet started')

        return this._stream
    }
}

module.exports = {
    record: (...args) => new Recording(...args)
}
