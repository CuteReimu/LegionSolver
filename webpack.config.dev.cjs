const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require("copy-webpack-plugin");

const languages = ['GMS', 'KMS', 'JMS', 'TMS', 'CMS'];

module.exports = {
    devServer: {
        compress: true,
        contentBase: path.join(__dirname, 'dist'),
        open: true,
        watchContentBase: true
    },
    entry: ['./src/settings.js', './src/main.js'],
    output: {
        filename: 'bundle.js'
    },
    mode: 'development',
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
    ]
};
