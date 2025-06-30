import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-aqms-id',
    version: '0.1.0',
    icon: '💨',
    title: 'Indonesia AQMS Stations',
    description: 'Windy.com plugin for AQMS stations in Indonesia',
    author: 'Azri Sofyan (Giwang Kanaka)',
    repository: 'https://github.com/Giwang-Kanaka/windy-plugin-aqms-id.git',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/aqms-id',
    private: true
};

export default config;
