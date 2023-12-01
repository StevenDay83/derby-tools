const webpack = require('webpack');
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './module.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'derbyweb.bundle.js',
    library:"DerbyTools"
  },
  resolve:{
    fallback: {
        assert:require.resolve('assert/'),
        buffer: require.resolve('buffer/'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve("stream-browserify")
    }
  },
  plugins:[
    // fix "process is not defined" error:
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
  })
  ]
};