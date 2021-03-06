import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import {WorkUtils} from "./WorkUtils";
import moment from "moment";
import {OSS_URL_HEAD} from "./URLHelper";

const {ipcRenderer} = require("electron")

const coverArr = []
const lyricUrl = OSS_URL_HEAD
let lastDir = ""

export const AppUtils = {
    isNull(text) {
        return text === null || text === undefined;
    },

    isEmpty(text) {
        return this.isNull(text) || text === ''
    },

    isNullOrNumber(text, defaultValue) {
        if (text === null || text === undefined) {
            return defaultValue
        } else return text
    },

    showValue(text) {
        if (text) return text
        else return '-'
    },

    /**
     * 遍历文件路径
     * @param dir
     * @param filesList
     * @param splitPath
     * @returns {Promise<void>}
     */
    async readFileList(dir, filesList, splitPath) {
        const files = fs.readdirSync(dir);
        for (const item of files) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                await this.readFileList(fullPath, filesList, splitPath);  //递归读取文件
            } else if (item.endsWith(".flac") && item.toLowerCase().indexOf("off vocal") === -1) {
                filesList.push(fullPath);
            }
        }
    },

    readFile(filePath) {
        return fs.readFileSync(filePath, 'utf-8')
    },

    // map转对象
    _strMapToObj(strMap) {
        let obj = Object.create(null);
        for (let [k, v] of strMap) {
            obj[k] = v;
        }
        return obj;
    },

    // 对象转map
    _objToStrMap(obj) {
        let strMap = new Map();
        for (let k of Object.keys(obj)) {
            strMap.set(k, obj[k]);
        }
        return strMap;
    },

    /**
     * 解析音乐信息
     * @param filesList
     * @param splitPath
     * @returns {Promise<*[]>}
     */
    async parseMusicInfo(filesList, splitPath) {
        coverArr.splice(0, coverArr.length);
        const infoList = []
        for (let i = 0; i < filesList.length; i++) {
            const obj = {}
            const filePath = filesList[i]
            await mm.parseFile(filePath).then(res => {
                const dir = filePath.substring(0, filePath.lastIndexOf(path.sep) + 1)
                obj.pic = this.savePic(dir, res.common.picture[0].data).replace(splitPath, '').replaceAll(path.sep, '/')
                obj.title = res.common.title
                obj.album = res.common.album
                obj.artist = res.common.artist
                obj.date = filePath.match(/\[(\S*)]/)[1]
                obj.path = filePath.replace(splitPath, '').replaceAll(path.sep, '/')
                obj.lyric = lyricUrl + "JP/" + obj.path.replace('.flac', '.lrc')
                obj.time = this.parseDurationToTime(Math.floor(res.format.duration))
                obj.trans = lyricUrl + "ZH/" + obj.path.replace('.flac', '.lrc')
                obj.roma = lyricUrl + "ROMA/" + obj.path.replace('.flac', '.lrc')
            })
            infoList.push(obj)
        }
        return infoList
    },

    parseDurationToTime(duration) {
        const time = moment.duration(duration, 'seconds')
        return moment({m: time.minutes(), s: time.seconds()}).format('mm:ss')
    },

    /**
     * 保存图片
     * @param dir
     * @param data
     * @returns {string}
     */
    savePic(dir, data) {
        let index = 1
        const base64 = this.arrayBufferToBase64(data)
        let hasPic = false
        if (lastDir === dir) {
            coverArr.map(item => {
                if (item === base64) {
                    hasPic = true
                }
            })
            if (!hasPic) {
                index = coverArr.length + 1
            }
        } else {
            coverArr.splice(0, coverArr.length);
        }
        const path = dir + `Cover_${index}.jpg`
        lastDir = dir
        if (!hasPic) {
            fs.writeFileSync(path, data)
            coverArr.push(base64)
        }
        return path
    },

    /**
     * byte数组 转 base64字符串
     * @param buffer
     * @returns {string}
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    /**
     * 转存为 txt文件
     * @param json
     * @param saveName
     */
    downloadTxtFile(json, saveName) {
        const blob = new Blob([json], {type: 'text/plain'})
        const blobUrl = URL.createObjectURL(blob); // 创建blob地址
        const element = document.createElement("a");
        element.href = blobUrl;
        element.download = saveName || '';
        let event;
        if (window.MouseEvent) event = new MouseEvent('click');
        else {
            event = document.createEvent('MouseEvents');
            event.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        }
        element.dispatchEvent(event);
    },

    /**
     * 删除字符串中最后一个指定字符串
     * @param origin
     * @param delStr
     * @returns {*}
     */
    delLastSameString(origin, delStr) {
        const reverseDelStr = delStr.split('').reverse().join('')
        const reverseOrigin = origin.split('').reverse().join('')
        return reverseOrigin.replace(reverseDelStr, '').split('').reverse().join('')
    },

    encodeURL(url) {
        return encodeURI(url)
            .replaceAll("'", "%27")
            .replaceAll('(', "%28")
            .replaceAll(')', "%29")
    },

    /**
     * 弹出提示窗
     * @param type 弹窗类型 "none", "info", "error", "question", "warning"
     * @param message 消息
     */
    openMsgDialog(type, message) {
        ipcRenderer.send('msgDialog', {type: type, message: message})
    },

    setBodyColor(colors) {
        const parseColor = function (hexStr) {
            return hexStr.length === 4 ? hexStr.substr(1).split('').map(function (s) {
                return 0x11 * parseInt(s, 16);
            }) : [hexStr.substr(1, 2), hexStr.substr(3, 2), hexStr.substr(5, 2)].map(function (s) {
                return parseInt(s, 16);
            })
        };

        const pad = function (s) {
            return (s.length === 1) ? '0' + s : s;
        };

        const gradientColors = function (start, end, steps, gamma) {
            let i, j, ms, me, output = [], so = [];
            gamma = gamma || 1;
            const normalize = function (channel) {
                return Math.pow(channel / 255, gamma);
            };
            start = parseColor(start).map(normalize);
            end = parseColor(end).map(normalize);
            for (i = 0; i < steps; i++) {
                ms = i / (steps - 1);
                me = 1 - ms;
                for (j = 0; j < 3; j++) {
                    so[j] = pad(Math.round(Math.pow(start[j] * me + end[j] * ms, 1 / gamma) * 255).toString(16));
                }
                output.push('#' + so.join(''));
            }
            return output;
        };

        const container = document.getElementsByClassName('outer_container')[0]
        container.style.background = 'linear-gradient(\n' +
            '                200.96deg,\n' +
            `                ${colors.color1} -49.09%,\n` +
            `                ${gradientColors(colors.color1, colors.color2, 2)[0]} 10.77%,\n` +
            `                ${colors.color2} 129.35%\n` +
            `            )`
        document.body.style.background = 'transparent'
    },

    // 返回1..100中，数组内不存在的最小值
    calcSmallAtIntArr(arr) {
        arr = arr.sort()
        let result = -1
        for (let i = 1; i <= 100; i++) {
            if (arr.indexOf(i) === -1) {
                result = i
                break
            }
        }
        return result
    },

    // 将 set 集合打印成 str
    arrToString(set) {
        let str = ''
        const arr = Array.from(set)
        arr.map((item, index) => {
            if (index !== arr.length - 1) {
                str += WorkUtils.parseGroupName(item)
                str += '、'
            } else str += WorkUtils.parseGroupName(item)
        })
        return AppUtils.isEmpty(str) ? '-' : str
    },

    // 颜色取反
    colorReverse(originColor) {
        const old = "0x" + originColor.replace(/#/g, "")
        let str = "000000" + (0xFFFFFF - old).toString(16);
        return str.substring(str.length - 6, str.length);
    },

    // 判断点是否在矩形区域内
    isPointInArea(point, area) {
        const deltaX = point.x - area.left
        const deltaY = point.y - area.top
        return !(deltaX <= 0 || deltaX >= area.right - area.left || deltaY <= 0 || deltaY >= area.bottom - area.top);
    },
}

module.export = AppUtils
