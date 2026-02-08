import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const PICKER_TIMEOUT_MS = 20_000
const CANCEL_SENTINEL = '__SKILLS_HUB_PICK_CANCELLED__'

export type PickDirectoryResult =
  | { status: 'selected'; path: string }
  | { status: 'cancelled' }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string }

export interface PickDirectoryOptions {
  title?: string
  initialPath?: string
}

interface PickerCommand {
  command: string
  args: string[]
  cancelExitCodes: Set<number>
}

function sanitizePrompt(title?: string): string {
  const fallback = 'Select a folder'
  if (!title) return fallback
  return title.replace(/"/g, '').trim() || fallback
}

function sanitizeInitialPath(initialPath?: string): string | undefined {
  const trimmed = initialPath?.trim()
  if (!trimmed) return undefined
  return trimmed
}

export function getPickerCommands(
  platform: NodeJS.Platform,
  options?: PickDirectoryOptions
): PickerCommand[] {
  const prompt = sanitizePrompt(options?.title)
  const initialPath = sanitizeInitialPath(options?.initialPath)

  if (platform === 'darwin') {
    const script = initialPath
      ? `try
set defaultLocation to POSIX file "${initialPath.replace(/"/g, '\\"')}"
set selectedFolder to choose folder with prompt "${prompt}" default location defaultLocation
return POSIX path of selectedFolder
on error number -128
return "${CANCEL_SENTINEL}"
end try`
      : `try
set selectedFolder to choose folder with prompt "${prompt}"
return POSIX path of selectedFolder
on error number -128
return "${CANCEL_SENTINEL}"
end try`

    return [
      {
        command: 'osascript',
        args: ['-e', script],
        cancelExitCodes: new Set(),
      },
    ]
  }

  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = "${prompt.replace(/"/g, '""')}"`,
      '$dialog.ShowNewFolderButton = $true',
      ...(initialPath ? [`$dialog.SelectedPath = "${initialPath.replace(/"/g, '""')}"`] : []),
      '$result = $dialog.ShowDialog()',
      'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
      '  Write-Output $dialog.SelectedPath',
      '} else {',
      `  Write-Output "${CANCEL_SENTINEL}"`,
      '}',
    ].join('; ')

    return [
      {
        command: 'powershell',
        args: ['-NoProfile', '-Command', script],
        cancelExitCodes: new Set(),
      },
    ]
  }

  if (platform === 'linux') {
    return [
      {
        command: 'zenity',
        args: [
          '--file-selection',
          '--directory',
          '--title',
          prompt,
          ...(initialPath ? ['--filename', initialPath] : []),
        ],
        cancelExitCodes: new Set([1]),
      },
      {
        command: 'kdialog',
        args: initialPath ? ['--getexistingdirectory', initialPath] : ['--getexistingdirectory'],
        cancelExitCodes: new Set([1]),
      },
    ]
  }

  return []
}

export async function pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult> {
  const commands = getPickerCommands(process.platform, options)

  if (commands.length === 0) {
    return {
      status: 'unsupported',
      message: `Directory picker is not supported on platform "${process.platform}".`,
    }
  }

  let sawUnavailableCommand = false
  let lastErrorMessage = ''

  for (const command of commands) {
    try {
      const result = await execFileAsync(command.command, command.args, {
        timeout: PICKER_TIMEOUT_MS,
      })
      const rawOutput =
        typeof result === 'string' || Buffer.isBuffer(result)
          ? result.toString()
          : result.stdout.toString()
      const output = rawOutput.trim()
      if (!output || output === CANCEL_SENTINEL) {
        return { status: 'cancelled' }
      }
      return { status: 'selected', path: output }
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        stdout?: string
        stderr?: string
        code?: string | number
        signal?: string
      }

      if (err.stdout?.trim() === CANCEL_SENTINEL) {
        return { status: 'cancelled' }
      }

      if (err.code === 'ENOENT') {
        sawUnavailableCommand = true
        continue
      }

      if (typeof err.code === 'number' && command.cancelExitCodes.has(err.code)) {
        return { status: 'cancelled' }
      }

      if (err.signal === 'SIGTERM' || err.signal === 'SIGKILL') {
        return {
          status: 'error',
          message: 'Directory picker timed out. Please try manual input.',
        }
      }

      lastErrorMessage =
        err.stderr?.trim() ||
        err.message ||
        `Failed to execute ${command.command} for directory picker.`
    }
  }

  if (sawUnavailableCommand) {
    return {
      status: 'unsupported',
      message: 'No supported system directory picker command is available.',
    }
  }

  return {
    status: 'error',
    message: lastErrorMessage || 'Directory picker failed unexpectedly.',
  }
}
