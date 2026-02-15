/**
 * macOS Notarization Script for Electron Builder
 * 
 * This script runs after code signing to notarize the app with Apple.
 * Required environment variables:
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 * 
 * To skip notarization (e.g., for local dev builds), set:
 * - SKIP_NOTARIZE=true
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: not macOS');
    return;
  }
  
  // Skip if SKIP_NOTARIZE is set
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization: SKIP_NOTARIZE is set');
    return;
  }
  
  // Check required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: Missing required environment variables');
    console.log('Required: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
    return;
  }
  
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  console.log(`Notarizing ${appPath}...`);
  
  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
    
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
