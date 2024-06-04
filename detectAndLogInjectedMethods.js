/**
 * @fileoverview 此脚本用于检测并记录网页中疑似原生方法注入以及其他外部方法注入的情况，
 * 并提供了一种机制来记录这些方法的行为，包括它们的调用记录。
 * 当用户点击页面时，会将检测到的方法汇总及调用记录复制到剪贴板上。
 * 使用抓包注入 在body下添加 
 * <script src="https://jihulab.com/huajicloud/myjs/-/raw/main/detectAndLogInjectedMethods.js"></script>
 * @author huajiqaq
 */

(function () {
    'use strict';

    let copyfunc;

    document.addEventListener('DOMContentLoaded', (event) => {
        copyfunc = navigator.clipboard.writeText.bind(navigator.clipboard);
    });

    function copyTextToClipboard(text) {
        try {
            copyfunc(text);
            console.log('文本已成功复制到剪贴板');
        } catch (err) {
            console.error('无法复制到剪贴板:', err);
        }
    }

    function init() {
        let callRecords = {
            nativeMethods: [], // 专门存放疑似Native注入方法的记录
            otherInjectedMethods: [] // 存放其他外部注入但非疑似Native的方法记录
        };

        function detectInjectedMethods() {
            return new Promise((resolve) => {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = 'about:blank';
                document.body.appendChild(iframe);

                iframe.onload = function () {
                    try {
                        const iframeWindow = iframe.contentWindow || iframe.contentDocument.defaultView;
                        const currentMethods = new Map(); // 用于存储方法及其toString结果
                        const iframeMethods = new Set();

                        // 收集当前页面window对象上的函数及其toString结果
                        for (let key in window) {
                            if (typeof window[key] === 'function') {
                                currentMethods.set(key, { name: key, isNative: window[key].toString() == 'function ${key} { [native code] }', toStringResult: window[key].toString() });
                            }
                        }

                        // 收集iframe window对象上的函数
                        for (let key in iframeWindow) {
                            if (typeof iframeWindow[key] === 'function') {
                                iframeMethods.add(key);
                            }
                        }

                        // 筛选出所有外部注入的方法，并标记疑似Native方法
                        const detectedMethods = Array.from(currentMethods).reduce((acc, [method, details]) => {
                            if (!iframeMethods.has(method)) {
                                acc.push({
                                    name: details.name,
                                    isInjected: true,
                                    isNativeSuspected: details.isNative,
                                    toStringResult: details.toStringResult
                                });
                            }
                            return acc;
                        }, []);

                        // 分别记录到不同的数组
                        detectedMethods.forEach(method => {
                            const record = {
                                name: method.name,
                                calls: [],
                                toStringResult: method.toStringResult
                            };
                            if (method.isNativeSuspected) {
                                callRecords.nativeMethods.push(record);
                            } else {
                                callRecords.otherInjectedMethods.push(record);
                            }
                        });

                        // 为新检测到的方法添加代理以记录调用
                        detectedMethods.forEach(method => {
                            if (!window[method.name].__isProxied__) { // 防止重复代理
                                const originalMethod = window[method.name];
                                window[method.name] = new Proxy(originalMethod, {
                                    apply(target, thisArg, argumentsList) {
                                        const recordArray = method.isNativeSuspected ? callRecords.nativeMethods : callRecords.otherInjectedMethods;
                                        const record = recordArray.find(record => record.name === method.name);
                                        if (record) {
                                            record.calls.push({
                                                args: argumentsList,
                                                timestamp: new Date()
                                            });
                                        }
                                        return Reflect.apply(target, thisArg, argumentsList);
                                    }
                                });
                                window[method.name].__isProxied__ = true; // 添加标记，避免多次代理
                            }
                        });

                        resolve(detectedMethods); // 返回所有外部注入的方法，其中包含疑似Native方法的标记

                    } catch (e) {
                        console.error('检测注入方法时发生错误:', e);
                        resolve([]); // 发生错误时返回空数组
                    } finally {
                        document.body.removeChild(iframe);
                    }
                };
            });
        }

        function logCallRecords() {
            let outputString = '';

            // 处理疑似Native注入方法
            if (callRecords.nativeMethods.length > 0) {
                outputString += '疑似Native注入方法及其调用记录:\n';
                callRecords.nativeMethods.forEach(methodRecord => {
                    outputString += `方法名: ${methodRecord.name}\n调用记录:\n`;
                    if (methodRecord.calls.length > 0) {
                        methodRecord.calls.forEach(call => {
                            outputString += `- 调用时间: ${call.timestamp}, 参数: ${JSON.stringify(call.args)}\n`;
                        });
                    } else {
                        outputString += '- 无调用记录\n';
                    }
                    outputString += '\n'; // 换行分隔
                });
            } else {
                outputString += '疑似Native注入方法: 无\n';
            }

            // 处理其他外部注入方法
            if (callRecords.otherInjectedMethods.length > 0) {
                outputString += '其他外部注入方法及其调用记录:\n';
                callRecords.otherInjectedMethods.forEach(methodRecord => {
                    outputString += `方法名: ${methodRecord.name}\n调用记录:\n`;
                    if (methodRecord.calls.length > 0) {
                        methodRecord.calls.forEach(call => {
                            outputString += `- 调用时间: ${call.timestamp}, 参数: ${JSON.stringify(call.args)}\n`;
                        });
                    } else {
                        outputString += '- 无调用记录\n';
                    }
                    outputString += '\n'; // 换行分隔
                });
            } else {
                outputString += '其他外部注入方法: 无\n';
            }

            // 复制输出，移除末尾多余的换行符
            copyTextToClipboard(outputString.replace(/\n$/, ''));
        }

        // 使用示例
        detectInjectedMethods().then(injectedMethods => {
            console.log('检测到的外部注入方法:');
            injectedMethods.forEach(method => {
                console.log(`${method.name} 方法被检测为外部注入`);
                if (method.isNativeSuspected) {
                    console.log(`并且该方法疑似为Native注入: ${method.toStringResult}`);
                }
            });

            if (callRecords.nativeMethods.length > 0) {
                console.log('疑似Native注入方法的调用记录:', callRecords.nativeMethods);
            } else {
                console.log('没有疑似Native注入方法的记录');
            }

            if (callRecords.otherInjectedMethods.length > 0) {
                console.log('其他外部注入方法的调用记录:', callRecords.otherInjectedMethods);
            } else {
                console.log('没有其他外部注入方法的记录');
            }

            // 添加点击事件监听器以触发日志输出
            document.addEventListener('click', logCallRecords);

        });
    }

    window.addEventListener("load", init)

})();