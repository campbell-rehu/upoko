/**
 * Validation script to check if test environment is set up correctly
 * 
 * Usage:
 *   npm run build
 *   node dist/test/validate-test-setup.js [test-data-dir]
 * 
 * This script validates:
 *   - FFmpeg/FFprobe availability
 *   - Upoko CLI functionality
 *   - Test data structure (if provided)
 *   - Required dependencies
 */

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { FFmpegService } from '../src/core/services/ffmpegService.js';

interface ValidationResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

class TestValidator {
  private results: ValidationResult[] = [];
  
  private addResult(component: string, status: 'pass' | 'fail' | 'warning', message: string, details?: string) {
    this.results.push({ component, status, message, details });
  }
  
  async validateFFmpeg(): Promise<void> {
    console.log('🔍 Checking FFmpeg availability...');
    
    try {
      const availability = await FFmpegService.checkFFmpegAvailability();
      
      if (availability.ffmpeg && availability.ffprobe) {
        this.addResult(
          'FFmpeg',
          'pass',
          `FFmpeg and FFprobe are available (version: ${availability.version})`
        );
      } else {
        const missing = [];
        if (!availability.ffmpeg) missing.push('ffmpeg');
        if (!availability.ffprobe) missing.push('ffprobe');
        
        this.addResult(
          'FFmpeg',
          'fail',
          `Missing components: ${missing.join(', ')}`,
          'FFmpeg and FFprobe are required for audio processing'
        );
      }
    } catch (error) {
      this.addResult(
        'FFmpeg',
        'fail',
        'Failed to check FFmpeg availability',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  
  async validateUpokoCLI(): Promise<void> {
    console.log('🔍 Checking Upoko CLI functionality...');
    
    try {
      const scriptPath = path.join(process.cwd(), 'dist', 'src', 'index.js');
      
      // Check if compiled CLI exists
      try {
        await fs.access(scriptPath);
        this.addResult('CLI Build', 'pass', 'Compiled CLI script exists');
      } catch {
        this.addResult('CLI Build', 'fail', 'Compiled CLI script not found', 'Run npm run build first');
        return;
      }
      
      // Test CLI split help command (more reliable than main help)
      const helpTest = await new Promise<boolean>((resolve) => {
        const proc = spawn('node', [scriptPath, 'split', '--help'], { stdio: 'pipe' });
        let hasOutput = false;
        
        proc.stdout.on('data', (data) => { 
          hasOutput = true;
          // Look for specific help content
          if (data.toString().includes('Split Command') || data.toString().includes('Usage:')) {
            proc.kill();
            resolve(true);
          }
        });
        
        proc.stderr.on('data', () => { hasOutput = true; });
        
        proc.on('close', (code) => {
          resolve(hasOutput);
        });
        
        proc.on('error', () => resolve(false));
        
        // Timeout after 3 seconds
        setTimeout(() => {
          proc.kill();
          resolve(false);
        }, 3000);
      });
      
      if (helpTest) {
        this.addResult('CLI Functionality', 'pass', 'CLI help command works');
      } else {
        this.addResult('CLI Functionality', 'fail', 'CLI help command failed or timed out');
      }
      
    } catch (error) {
      this.addResult(
        'CLI Functionality',
        'fail',
        'Failed to test CLI functionality',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  
  async validateDependencies(): Promise<void> {
    console.log('🔍 Checking Node.js dependencies...');
    
    const requiredPackages = [
      'ffmpeg-static',
      'ffprobe-static', 
      'node-id3',
      'axios'
    ];
    
    for (const pkg of requiredPackages) {
      try {
        await import(pkg);
        this.addResult('Dependencies', 'pass', `${pkg} is available`);
      } catch (error) {
        this.addResult(
          'Dependencies',
          'fail',
          `${pkg} is not available`,
          'Run npm install to install missing dependencies'
        );
      }
    }
  }
  
  async validateTestData(testDataDir: string): Promise<void> {
    console.log(`🔍 Checking test data structure in ${testDataDir}...`);
    
    try {
      await fs.access(testDataDir);
      
      const items = await fs.readdir(testDataDir);
      const audioFiles = items.filter(f => /\.(mp3|m4a|m4b|aac|wav|flac)$/i.test(f));
      const directories = [];
      
      for (const item of items) {
        const itemPath = path.join(testDataDir, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          directories.push(item);
        }
      }
      
      if (audioFiles.length > 0) {
        this.addResult(
          'Test Data',
          'pass',
          `Found ${audioFiles.length} audio files: ${audioFiles.join(', ')}`
        );
        
        // Check for M4B files specifically
        const m4bFiles = audioFiles.filter(f => f.toLowerCase().endsWith('.m4b'));
        if (m4bFiles.length > 0) {
          this.addResult(
            'Test Data',
            'pass',
            `Found ${m4bFiles.length} M4B files for testing`
          );
        } else {
          this.addResult(
            'Test Data',
            'warning',
            'No M4B files found - tests may need different file types'
          );
        }
      } else {
        this.addResult(
          'Test Data',
          'warning',
          'No audio files found in test data directory'
        );
      }
      
      if (directories.length > 0) {
        this.addResult(
          'Test Data',
          'pass',
          `Found ${directories.length} subdirectories: ${directories.join(', ')}`
        );
        
        // Check if any directories might contain expected test results
        for (const dir of directories) {
          const dirPath = path.join(testDataDir, dir);
          const dirItems = await fs.readdir(dirPath);
          const dirAudioFiles = dirItems.filter(f => /\.(mp3|m4a|m4b|aac|wav|flac)$/i.test(f));
          
          if (dirAudioFiles.length > 0) {
            this.addResult(
              'Test Data',
              'pass',
              `Directory '${dir}' contains ${dirAudioFiles.length} audio files (potential expected results)`
            );
          }
        }
      }
      
    } catch (error) {
      this.addResult(
        'Test Data',
        'fail',
        'Cannot access test data directory',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  
  async validateNodeVersion(): Promise<void> {
    console.log('🔍 Checking Node.js version...');
    
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    
    if (majorVersion >= 18) {
      this.addResult('Node.js', 'pass', `Node.js version ${version} (compatible)`);
    } else if (majorVersion >= 16) {
      this.addResult(
        'Node.js',
        'warning',
        `Node.js version ${version} (may work but not tested)`,
        'Recommended: Node.js 18 or higher'
      );
    } else {
      this.addResult(
        'Node.js',
        'fail',
        `Node.js version ${version} (too old)`,
        'Requires Node.js 16 or higher, recommended 18+'
      );
    }
  }
  
  displayResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    const grouped = {
      pass: this.results.filter(r => r.status === 'pass'),
      warning: this.results.filter(r => r.status === 'warning'),
      fail: this.results.filter(r => r.status === 'fail')
    };
    
    console.log(`\nSummary:`);
    console.log(`  ✅ Passed: ${grouped.pass.length}`);
    console.log(`  ⚠️  Warnings: ${grouped.warning.length}`);
    console.log(`  ❌ Failed: ${grouped.fail.length}`);
    
    if (grouped.pass.length > 0) {
      console.log('\n✅ PASSED:');
      for (const result of grouped.pass) {
        console.log(`  ${result.component}: ${result.message}`);
      }
    }
    
    if (grouped.warning.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      for (const result of grouped.warning) {
        console.log(`  ${result.component}: ${result.message}`);
        if (result.details) {
          console.log(`    → ${result.details}`);
        }
      }
    }
    
    if (grouped.fail.length > 0) {
      console.log('\n❌ FAILED:');
      for (const result of grouped.fail) {
        console.log(`  ${result.component}: ${result.message}`);
        if (result.details) {
          console.log(`    → ${result.details}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (grouped.fail.length === 0) {
      console.log('✅ VALIDATION PASSED - Environment ready for testing!');
    } else {
      console.log('❌ VALIDATION FAILED - Fix the issues above before running tests');
    }
    
    console.log('='.repeat(60) + '\n');
  }
  
  async run(testDataDir?: string): Promise<boolean> {
    console.log('Test Environment Validation');
    console.log('==========================\n');
    
    await this.validateNodeVersion();
    await this.validateDependencies();
    await this.validateFFmpeg();
    await this.validateUpokoCLI();
    
    if (testDataDir) {
      await this.validateTestData(testDataDir);
    }
    
    this.displayResults();
    
    const failCount = this.results.filter(r => r.status === 'fail').length;
    return failCount === 0;
  }
}

async function main() {
  const testDataDir = process.argv[2];
  
  const validator = new TestValidator();
  const success = await validator.run(testDataDir);
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Validation failed with error:', error);
  process.exit(1);
});