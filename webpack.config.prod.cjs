const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require("copy-webpack-plugin");

const languages = ['GMS', 'KMS', 'JMS', 'TMS', 'CMS'];

module.exports = {
    entry: ['./src/settings.js', './src/main.js'],
    output: {
        filename: '[name].[contenthash].js',
        path: path.resolve(__dirname, 'dist', 'prod')
    },
    mode: 'production',
    module: {
        rules: [
            { 
                test: /\.js$/, 
                exclude: /node_modules/,
                loader: 'babel-loader',
                options: {
                    presets: [{'plugins': ['@babel/plugin-proposal-class-properties']}]
                }
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader'
                ]
            },
                  {
                test: /\.wasm$/,
                type: "asset/resource"
            },

            {
                test: /\.worker\.js$/,
                use: { loader: "worker-loader" }  // if using worker-loader
            }
        ]
    },
    optimization: {
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendor',
                    chunks: 'all',
                },
            },
        },
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'src/index.html',
            inject: false,
            languages
        }),
        new CopyWebpackPlugin({
              patterns: [
                { from: "public", to: "." }
              ]
            })
    ],
};
