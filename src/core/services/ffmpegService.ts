import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import { AudioFormat, FFmpegProgress } from '../models/types.js';

// Use createRequire to import CommonJS modules in ES module context
const require = createRequire(import.meta.url);
const ffmpegStatic: string = require('ffmpeg-static');
const ffprobeStatic: any = require('ffprobe-static');

// Handle the different ways ffprobe-static exports its path
const ffprobePath: string = typeof ffprobeStatic === 'string' ? ffprobeStatic : ffprobeStatic.path;

if (!ffmpegStatic || !ffprobePath) {
  throw new Error('FFmpeg or FFprobe static binaries not found. Please ensure ffmpeg-static and ffprobe-static are properly installed.');
}

export interface AudioInfo {
  duration: number; // in milliseconds
  format: string;
  bitRate?: number;
  sampleRate?: number;
  channels?: number;
  size: number; // file size in bytes
  codec?: string;
}

export interface FFmpegError extends Error {
  code?: string;
  stderr?: string;
}

export class FFmpegService {
  /**
   * Get detailed audio file information using ffprobe
   */
  static async getAudioInfo(filePath: string): Promise<AudioInfo> {
    await this.validateAudioFile(filePath);

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      const ffprobe = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code: number | null) => {
        if (code !== 0) {
          const error: FFmpegError = new Error(`FFprobe failed with code ${code}: ${stderr}`);
          error.code = code?.toString();
          error.stderr = stderr;
          reject(error);
          return;
        }

        try {
          const probeData = JSON.parse(stdout);
          const format = probeData.format;
          const audioStream = probeData.streams.find((stream: any) => stream.codec_type === 'audio');

          if (!audioStream) {
            reject(new Error('No audio stream found in file'));
            return;
          }

          const duration = parseFloat(format.duration) * 1000; // Convert to milliseconds
          const size = parseInt(format.size);
          const bitRate = parseInt(format.bit_rate);

          const audioInfo: AudioInfo = {
            duration,
            format: format.format_name,
            bitRate: bitRate || undefined,
            sampleRate: parseInt(audioStream.sample_rate) || undefined,
            channels: audioStream.channels || undefined,
            size,
            codec: audioStream.codec_name || undefined
          };

          resolve(audioInfo);
        } catch (parseError) {
          reject(new Error(`Failed to parse ffprobe output: ${parseError}`));
        }
      });

      ffprobe.on('error', (error: Error) => {
        reject(new Error(`Failed to spawn ffprobe: ${error.message}`));
      });
    });
  }

  /**
   * Split audio file by time range with high quality settings
   */
  static async splitAudioByTime(
    inputPath: string,
    outputPath: string,
    startTimeMs: number,
    durationMs: number,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    await this.validateAudioFile(inputPath);
    
    // Ensure output directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });

    const startTime = this.formatTimeForFFmpeg(startTimeMs);
    const duration = this.formatTimeForFFmpeg(durationMs);

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-ss', startTime,
        '-t', duration,
        '-c', 'copy', // Copy streams without re-encoding for speed and quality
        '-avoid_negative_ts', 'make_zero',
        '-map_metadata', '0', // Copy metadata
        '-y', // Overwrite output file
        outputPath
      ];

      const ffmpeg = spawn(ffmpegStatic, args);
      let stderr = '';
      let progressData = '';

      ffmpeg.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        progressData += chunk;

        // Extract progress information if callback is provided
        if (progressCallback) {
          const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (timeMatch) {
            try {
              const currentTimeMs = this.parseFFmpegTime(timeMatch[1]);
              const progress = Math.min((currentTimeMs / durationMs) * 100, 100);
              progressCallback(progress);
            } catch (e) {
              // Ignore time parsing errors for progress updates
            }
          }
        }
      });

      ffmpeg.on('close', (code: number | null) => {
        if (code !== 0) {
          const error: FFmpegError = new Error(`FFmpeg failed with code ${code}: ${stderr}`);
          error.code = code?.toString();
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve();
      });

      ffmpeg.on('error', (error: Error) => {
        reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
      });
    });
  }

  /**
   * Validate that the file exists and is a valid audio file
   */
  static async validateAudioFile(filePath: string): Promise<boolean> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, fs.constants.R_OK);
      
      // Check file stats
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      if (stats.size === 0) {
        throw new Error(`File is empty: ${filePath}`);
      }

      // Check if file has a valid audio extension
      const validExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.m4b'];
      const hasValidExtension = validExtensions.some(ext => 
        filePath.toLowerCase().endsWith(ext)
      );

      if (!hasValidExtension) {
        throw new Error(`Unsupported audio file format: ${filePath}. Supported formats: ${validExtensions.join(', ')}`);
      }

      // Quick validation using ffprobe to ensure it's a valid audio file
      return new Promise((resolve, reject) => {
        const args = [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_type',
          '-of', 'csv=p=0',
          filePath
        ];

        const ffprobe = spawn(ffprobePath, args);
        let stdout = '';
        let stderr = '';

        ffprobe.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        ffprobe.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        ffprobe.on('close', (code: number | null) => {
          if (code !== 0 || !stdout.trim().includes('audio')) {
            reject(new Error(`Invalid audio file: ${filePath}. ${stderr || 'No audio stream found.'}`));
            return;
          }
          resolve(true);
        });

        ffprobe.on('error', (error: Error) => {
          reject(new Error(`Failed to validate audio file: ${error.message}`));
        });
      });

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`File validation failed: ${error}`);
    }
  }

  /**
   * Convert milliseconds to FFmpeg time format (HH:MM:SS.mmm)
   */
  static formatTimeForFFmpeg(timeMs: number): string {
    if (timeMs < 0) {
      throw new Error('Time cannot be negative');
    }

    const totalSeconds = Math.floor(timeMs / 1000);
    const milliseconds = Math.floor(timeMs % 1000);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Format: HH:MM:SS.mmm
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Parse FFmpeg time format back to milliseconds
   * Supports formats like: HH:MM:SS.mmm, MM:SS.mmm, SS.mmm
   */
  static parseFFmpegTime(timeString: string): number {
    const parts = timeString.split(':');
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      // HH:MM:SS.mmm format
      hours = parseInt(parts[0]);
      minutes = parseInt(parts[1]);
      seconds = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS.mmm format
      minutes = parseInt(parts[0]);
      seconds = parseFloat(parts[1]);
    } else if (parts.length === 1) {
      // SS.mmm format
      seconds = parseFloat(parts[0]);
    } else {
      throw new Error(`Invalid time format: ${timeString}`);
    }

    return Math.floor((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  /**
   * Get supported audio formats
   */
  static getSupportedFormats(): AudioFormat[] {
    return ['mp3', 'm4a', 'aac', 'wav', 'flac'];
  }

  /**
   * Check if FFmpeg and FFprobe binaries are available and working
   */
  static async checkFFmpegAvailability(): Promise<{ ffmpeg: boolean; ffprobe: boolean; version?: string }> {
    const checkFFmpeg = new Promise<boolean>((resolve) => {
      const ffmpeg = spawn(ffmpegStatic, ['-version']);
      ffmpeg.on('close', (code: number | null) => resolve(code === 0));
      ffmpeg.on('error', () => resolve(false));
    });

    const checkFFprobe = new Promise<boolean>((resolve) => {
      const ffprobe = spawn(ffprobePath, ['-version']);
      ffprobe.on('close', (code: number | null) => resolve(code === 0));
      ffprobe.on('error', () => resolve(false));
    });

    const getVersion = new Promise<string>((resolve) => {
      const ffmpeg = spawn(ffmpegStatic, ['-version']);
      let stdout = '';
      ffmpeg.stdout.on('data', (data: Buffer) => stdout += data.toString());
      ffmpeg.on('close', () => {
        const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
        resolve(versionMatch ? versionMatch[1] : 'unknown');
      });
      ffmpeg.on('error', () => resolve('unknown'));
    });

    const [ffmpegAvailable, ffprobeAvailable, version] = await Promise.all([
      checkFFmpeg,
      checkFFprobe,
      getVersion
    ]);

    return {
      ffmpeg: ffmpegAvailable,
      ffprobe: ffprobeAvailable,
      version: ffmpegAvailable ? version : undefined
    };
  }
}

// Export default for convenience
export default FFmpegService;