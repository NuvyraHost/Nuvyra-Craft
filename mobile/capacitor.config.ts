import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nuvyra.craft.mobile',
  appName: 'Nuvyra-Craft',
  webDir: 'www',
  android: {
    minWebViewVersion: '55.0.2883.91', // Chrome 55+ for Android 6+
    allowMixedContent: false,
    backgroundColor: '#030817',
    buildOptions: {
      signingType: 'apksigner'
    }
  },
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_server',
      iconColor: '#00b8ff'
    }
  }
};

export default config;
