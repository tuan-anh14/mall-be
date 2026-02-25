import appConfig from './app.config';
import databaseConfig from './database.config';
import storageConfig from './storage.config';
import oauthConfig from './oauth.config';
import emailConfig from './email.config';

export default () => ({
  ...appConfig(),
  ...databaseConfig(),
  ...storageConfig(),
  ...oauthConfig(),
  ...emailConfig(),
});
