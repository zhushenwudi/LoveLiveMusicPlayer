import {PRE_URL, PROD_URL} from "./URLHelper";

// 是否是预发环境
const isPre = false

export const VersionUtils = {
    refreshDataUrl() {
        return isPre ? PRE_URL : PROD_URL
    }
}
