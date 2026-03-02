#!/usr/bin/env node

/**
 * Automated Setup and Test Script for Messaging Backend
 * 
 * This script:
 * 1. Checks and installs required dependencies (multer)
 * 2. Verifies installation
 * 3. Runs comprehensive backend tests
 * 4. Provides detailed results
 * 
 * Usage: node src/scripts/setupAndTestMessaging.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) { log(`✅ ${message}`, 'green'); }
function logError(message) { log(`❌ ${message}`, 'red'); }
function logInfo(message) { log(`ℹ️  ${message}`, 'cyan'); }
function logWarning(message) { log(`⚠️  ${message}`, 'yellow'); }
function logStep(message) { log(`\n${message}`, 'magenta'); }

async function checkMulterInstalled() {
  logStep('📦 Step 1: Checking Dependencies...');
  
  try {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const hasMulter = packageJson.dependencies?.multer || packageJson.devDependencies?.multer;
    
    if (hasMulter) {
      logSuccess('Multer is listed in package.json');
      
      // Check if it's actually installed
      try {
        require.resolve('multer');
        logSuccess('Multer is installed in node_modules');
        return true;
      } catch (e) {
        logWarning('Multer is in package.json but not installed in node_modules');
        return false;
      }
    } else {
      logWarning('Multer is not in package.json');
      return false;
    }
  } catch (error) {
    logError(`Error checking dependencies: ${error.message}`);
    return false;
  }
}

async function installMulter() {
  logStep('📥 Step 2: Installing Multer...');
  
  try {
    logInfo('Running: npm install multer');
    const output = execSync('npm install multer', {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'pipe',
      encoding: 'utf8',
    });
    
    logSuccess('Multer installed successfully');
    return true;
  } catch (error) {
    // Check if it's a permission error
    if (error.message.includes('EPERM') || error.stderr?.includes('EPERM')) {
      logError('Permission denied - cannot install multer automatically');
      logWarning('\n⚠️  Manual installation required:');
      logInfo('   Please run this command manually:');
      logInfo('   cd backend && npm install multer');
      logInfo('\n   Or if you have permission issues:');
      logInfo('   sudo npm install multer');
      return false;
    }
    
    logError(`Failed to install multer: ${error.message}`);
    if (error.stdout) {
      logInfo(`Output: ${error.stdout}`);
    }
    if (error.stderr) {
      logWarning(`Error: ${error.stderr.substring(0, 200)}...`);
    }
    return false;
  }
}

async function verifyInstallation() {
  logStep('🔍 Step 3: Verifying Installation...');
  
  try {
    const multer = require('multer');
    logSuccess('Multer module loads successfully');
    
    // Check if it has the expected exports
    if (typeof multer === 'function') {
      logSuccess('Multer is properly exported');
      return true;
    } else {
      logError('Multer export is unexpected');
      return false;
    }
  } catch (error) {
    logError(`Failed to load multer: ${error.message}`);
    return false;
  }
}

async function checkServerRunning() {
  logStep('🔌 Step 4: Checking Server Status...');
  
  const http = require('http');
  
  return new Promise((resolve) => {
    const req = http.request('http://localhost:5000/health', { timeout: 2000 }, (res) => {
      if (res.statusCode === 200) {
        logSuccess('Server is running and responding');
        resolve(true);
      } else {
        logWarning(`Server responded with status ${res.statusCode}`);
        resolve(false);
      }
    });
    
    req.on('error', () => {
      logWarning('Server is not running or not accessible');
      logInfo('You may need to restart the server after installing multer');
      resolve(false);
    });
    
    req.on('timeout', () => {
      logWarning('Server check timed out');
      resolve(false);
    });
    
    req.end();
  });
}

async function runTests() {
  logStep('🧪 Step 5: Running Backend Tests...');
  
  try {
    logInfo('Running comprehensive backend tests...');
    const testScript = path.resolve(__dirname, 'testCompleteMessagingBackend.js');
    
    // Run the test script and capture output
    const output = execSync(`node "${testScript}"`, {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit',
      encoding: 'utf8',
    });
    
    return true;
  } catch (error) {
    // The test script exits with code 1 if tests fail, which is expected
    // We'll let the test script output handle the details
    return false;
  }
}

async function main() {
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('🚀 Automated Messaging Backend Setup and Test', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  const results = {
    multerInstalled: false,
    multerVerified: false,
    serverRunning: false,
    testsPassed: false,
  };

  // Step 1: Check if multer is installed
  results.multerInstalled = await checkMulterInstalled();

  // Step 2: Install multer if needed
  if (!results.multerInstalled) {
    logInfo('\nMulter needs to be installed...');
    const installed = await installMulter();
    if (installed) {
      results.multerInstalled = true;
    } else {
      logWarning('\n⚠️  Could not install multer automatically.');
      logInfo('\n📋 Next Steps:');
      logInfo('   1. Install multer manually: cd backend && npm install multer');
      logInfo('   2. Restart the server: npm start');
      logInfo('   3. Re-run this script to test: node src/scripts/setupAndTestMessaging.js');
      logInfo('\n   Or continue with testing (some tests will fail without multer)...\n');
      // Don't exit - continue to show what else needs to be done
    }
  }

  // Step 3: Verify installation
  results.multerVerified = await verifyInstallation();
  if (!results.multerVerified) {
    logError('\n❌ Multer installation verification failed');
    process.exit(1);
  }

  // Step 4: Check server
  results.serverRunning = await checkServerRunning();
  if (!results.serverRunning) {
    logWarning('\n⚠️  Server is not running');
    logInfo('Please start the server in another terminal:');
    logInfo('   cd backend && npm start');
    logInfo('\nThen re-run this script to test the backend.');
    process.exit(0);
  }

  // Step 5: Run tests
  log('\n');
  const testExitCode = await runTests();
  results.testsPassed = testExitCode === 0;

  // Final summary
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('📊 Setup Summary', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  log(`Multer Installed: ${results.multerInstalled ? '✅' : '❌'}`);
  log(`Multer Verified: ${results.multerVerified ? '✅' : '❌'}`);
  log(`Server Running: ${results.serverRunning ? '✅' : '❌'}`);
  log(`Tests Passed: ${results.testsPassed ? '✅' : '❌'}`);

  if (results.multerInstalled && results.multerVerified && results.serverRunning) {
    log('\n✅ Setup complete!', 'green');
    if (results.testsPassed) {
      log('🎉 All tests passed! Backend is ready for use.', 'green');
    } else {
      log('⚠️  Some tests failed. Check the test output above.', 'yellow');
    }
  } else {
    log('\n⚠️  Setup incomplete. Please address the issues above.', 'yellow');
  }

  process.exit(results.testsPassed ? 0 : 1);
}

main().catch((error) => {
  logError(`\nFatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
