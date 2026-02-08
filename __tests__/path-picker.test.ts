// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  execFile: execFileMock,
}))

import { getPickerCommands, pickDirectory } from '@/lib/path-picker'

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
  })
}

type MockExecError = Error & {
  code?: string | number
  stderr?: string
  stdout?: string
}

function mockExecFileSuccess(stdout: string) {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout?: string, stderr?: string) => void
    ) => {
      callback(null, stdout, '')
    }
  )
}

function mockExecFileError(error: MockExecError) {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: NodeJS.ErrnoException, stdout?: string, stderr?: string) => void
    ) => {
      callback(error as NodeJS.ErrnoException, error.stdout || '', error.stderr || '')
    }
  )
}

describe('path picker', () => {
  afterEach(() => {
    execFileMock.mockReset()
  })

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor)
    }
  })

  it('builds expected picker commands by platform', () => {
    expect(getPickerCommands('darwin').map((cmd) => cmd.command)).toEqual(['osascript'])
    expect(getPickerCommands('win32').map((cmd) => cmd.command)).toEqual(['powershell'])
    expect(getPickerCommands('linux').map((cmd) => cmd.command)).toEqual(['zenity', 'kdialog'])
  })

  it('returns selected result when picker succeeds', async () => {
    setPlatform('darwin')
    mockExecFileSuccess('/tmp/my-project\n')

    await expect(pickDirectory({ title: 'Select Folder' })).resolves.toEqual({
      status: 'selected',
      path: '/tmp/my-project',
    })
  })

  it('returns cancelled when linux picker exits with cancel code', async () => {
    setPlatform('linux')
    const cancelError: MockExecError = new Error('cancelled')
    cancelError.code = 1
    mockExecFileError(cancelError)

    await expect(pickDirectory()).resolves.toEqual({ status: 'cancelled' })
  })

  it('returns unsupported when no picker command is available', async () => {
    setPlatform('linux')
    const enoentError = new Error('missing command') as NodeJS.ErrnoException & { code: string }
    enoentError.code = 'ENOENT'
    mockExecFileError(enoentError)

    const result = await pickDirectory()
    expect(result.status).toBe('unsupported')
  })

  it('returns error for execution failures', async () => {
    setPlatform('win32')
    const runtimeError = new Error('boom') as NodeJS.ErrnoException & {
      code: string
      stderr: string
    }
    runtimeError.code = 'EACCES'
    runtimeError.stderr = 'permission denied'
    mockExecFileError(runtimeError)

    await expect(pickDirectory()).resolves.toEqual({
      status: 'error',
      message: 'permission denied',
    })
  })
})
