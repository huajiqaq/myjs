/**
 * @fileoverview 此脚本用于检测并记录网页中疑似原生方法注入以及其他外部方法注入的情况，
 * 并提供了一种机制来记录这些方法的行为，包括它们的调用记录。
 * 当用户点击页面时，会将检测到的方法汇总及调用记录复制到剪贴板上。
 * 使用抓包注入 在body下添加 
 * <script>js内容</script>
 * @version 0.2
 * @author huajiqaq
 */

(function () {
    'use strict';

    function init() {
        // 设置为全局变量 方便调试
        window.callRecords = {
            nativeMethods: [], // 专门存放疑似Native注入方法的记录
            otherInjectedMethods: [], // 存放其他外部注入但非疑似Native的方法记录
            nativeObjects: [], // 存放其他外部注入但非疑似Native的对象记录
            otherInjectedObjects: [], // 存放其他外部注入但非疑似Native的对象记录
        };


        function isNative(value, name) {
            let toStringResult = value.toString()
            return toStringResult == `function ${name}() { [native code] }` || toStringResult == 'function () { [native code] }'
        };

        function isAllNativeMethods(object) {
            if (typeof object === 'function') {
                // 避免传入function
                object = [object]
            }
            // 遍历对象自身可枚举属性
            for (let key in object) {
                let property = object[key];
                // 检查属性是否为函数且不是原生代码
                if (typeof property === 'function' && !isNative(property, key)) {
                    return false; // 只要有一个方法不是原生代码，就返回false
                }
            }
            return true; // 所有检查过的属性方法都是原生代码，则返回true
        }


        function detectInjectedMethodsInObjects(obj) {
            const methods = new Map();
            const objtoString = obj.toString()

            // 收集当前页面window对象上的函数及其toString结果
            for (let key in obj) {
                // 简单关键字跳过webpack和本js使用部分参数 可能并不通用
                if (key.includes('webpack') || key.includes("_myorifunc") || key.includes("callRecords")) continue

                let value = obj[key]
                // 跳过null的属性
                if (value === null) continue

                // 跳过自身
                if (value.toString() === objtoString) continue
                // 只记录object或function
                if (typeof value !== 'object' && typeof value !== 'function') continue
                let methodDetails = {
                    name: key,
                    isNative: isAllNativeMethods(value),
                    isObject: typeof value === 'object',
                };

                methods.set(key, methodDetails);

            }

            return methods;
        }


        function detectInjectedMethods() {
            return new Promise((resolve) => {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = 'about:blank';

                iframe.onload = function () {
                    try {
                        const iframeWindow = iframe.contentWindow || iframe.contentDocument.defaultView;

                        // 收集当前页面window对象及其子对象上的函数
                        const mainPageMethods = detectInjectedMethodsInObjects(window);
                        // 收集iframe window对象及其子对象上的函数
                        const iframeMethods = detectInjectedMethodsInObjects(iframeWindow);

                        const detectedMethods = Array.from(mainPageMethods).reduce((acc, [method, details]) => {
                            const iframeMethodDetails = iframeMethods.get(method);

                            if (!iframeMethodDetails || // 如果iframe中没有此方法
                                (details.isNative !== iframeMethodDetails.isNative) || // 或者原生状态不一致
                                (details.isObject !== iframeMethodDetails.isObject)) { // 或者函数isObjet不一致
                                acc.push({
                                    name: details.name,
                                    isInjected: true,
                                    isNativeSuspected: details.isNative,
                                    isObjet: details.isObject,
                                });
                            }
                            return acc;
                        }, []);



                        // 分别记录到不同的数组
                        detectedMethods.forEach(method => {

                            let record
                            let recordArray
                            if (method.isObjet) {

                                record = {
                                    name: method.name,
                                    functions: [],
                                };

                                if (method.isNativeSuspected) {
                                    recordArray = callRecords.nativeObjects
                                } else {
                                    recordArray = callRecords.otherInjectedObjects
                                }

                                if (!window[method.name + "_myorifunc"]) { // 防止重复代理
                                    window[method.name + "_myorifunc"] = window[method.name]
                                } else { // 有标记先还原
                                    window[method.name] = window[method.name + "_myorifunc"]
                                }


                                window[method.name] = new Proxy({}, {
                                    get(target, property, receiver) {

                                        // 对于访问的属性，如果是函数，则返回一个新的函数
                                        if (typeof window[method.name + "_myorifunc"][property] === 'function') {
                                            return function (...argumentsList) {
                                                if (record.functions[property] == null) {
                                                    record.functions[property] = {
                                                        name: property,
                                                        calls: [],
                                                    };
                                                }

                                                record.functions[property].calls.push({
                                                    methodName: property,
                                                    args: argumentsList,
                                                    timestamp: new Date()
                                                });

                                                return window[method.name + "_myorifunc"][property](...argumentsList);
                                            }
                                        }
                                        // 其他属性直接返回
                                        return window[method.name + "_myorifunc"][property];
                                    },
                                    set(target, property, value, receiver) {
                                        return window[method.name + "_myorifunc"][property] = value;
                                    }
                                });

                            } else {

                                record = {
                                    name: method.name,
                                    calls: [],
                                };

                                if (method.isNativeSuspected) {
                                    recordArray = callRecords.nativeMethods
                                } else {
                                    recordArray = callRecords.otherInjectedMethods
                                }


                                if (!window[method.name + "_myorifunc"]) { // 防止重复代理
                                    window[method.name + "_myorifunc"] = window[method.name]
                                } else { // 有标记先还原
                                    window[method.name] = window[method.name + "_myorifunc"]
                                }

                                const originalMethod = window[method.name];
                                window[method.name] = new Proxy(originalMethod, {
                                    apply(target, thisArg, argumentsList) {
                                        record.calls.push({
                                            args: argumentsList,
                                            timestamp: new Date()
                                        });
                                        return window[method.name + "_myorifunc"](...argumentsList);
                                    }
                                });


                            }

                            recordArray.push(record);

                        });


                        resolve(detectedMethods); // 返回所有外部注入的方法，其中包含疑似Native方法的标记

                    } catch (e) {
                        console.error('检测注入方法时发生错误:', e);
                        resolve([]); // 发生错误时返回空数组
                    } finally {
                        document.body.removeChild(iframe);
                    }
                };

                // display 为 none 的 iframe 的 onload事件 需要写在 appendChild 前 否则 onload事件 无法触发
                document.body.appendChild(iframe);

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

            // 处理疑似Native注入对象
            if (callRecords.nativeObjects.length > 0) {
                outputString += '疑似Native注入对象及其调用记录:\n';
                callRecords.nativeObjects.forEach(methodRecord => {
                    outputString += `对象名: ${methodRecord.name}\n调用记录:\n`;
                    if (Object.keys(methodRecord.functions).length > 0) {
                        Object.values(methodRecord.functions).forEach(funclog => {
                            if (funclog.calls.length > 0) {
                                funclog.calls.forEach(call => {
                                    outputString += `- 调用时间: ${call.timestamp}, 参数: ${JSON.stringify(call.args)}\n`;
                                });
                            } else {
                                outputString += '- 无调用记录\n';
                            }
                        });
                    } else {
                        outputString += '- 该对象下无函数\n';
                    }
                    outputString += '\n'; // 换行分隔
                });
            } else {
                outputString += '疑似Native注入对象: 无\n';
            }

            // 处理其他外部注入对象
            if (callRecords.otherInjectedObjects.length > 0) {
                outputString += '其他外部注入对象及其调用记录:\n';
                callRecords.otherInjectedObjects.forEach(methodRecord => {
                    outputString += `对象名: ${methodRecord.name}\n调用记录:\n`;
                    if (Object.keys(methodRecord.functions).length > 0) {
                        Object.values(methodRecord.functions).forEach(funclog => {
                            if (funclog.calls.length > 0) {
                                funclog.calls.forEach(call => {
                                    outputString += `- 调用时间: ${call.timestamp}, 参数: ${JSON.stringify(call.args)}\n`;
                                });
                            } else {
                                outputString += '- 无调用记录\n';
                            }
                        });
                    } else {
                        outputString += '- 该对象下无函数\n';
                    }
                    outputString += '\n'; // 换行分隔
                });

            } else {
                outputString += '其他外部注入对象: 无\n';
            }

            // 复制输出，移除末尾多余的换行符
            copyTextToClipboard(outputString.replace(/\n$/, ''));
        }

        // 使用示例
        detectInjectedMethods().then(injectedMethods => {
            console.log('检测到的外部注入方法:');

            if (injectedMethods.length == 0) {
                console.log("无方法被注入")
                return
            }

            injectedMethods.forEach(method => {
                console.log(`${method.name} 方法被检测为外部注入`);
                if (method.isNativeSuspected) {
                    console.log(`并且该方法疑似为Native注入`);
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


            if (callRecords.nativeObjects.length > 0) {
                console.log('疑似Native注入对象的调用记录:', callRecords.nativeObjects);
            } else {
                console.log('没有疑似Native注入对象的记录');
            }

            if (callRecords.otherInjectedObjects.length > 0) {
                console.log('其他外部注入对象的调用记录:', callRecords.otherInjectedObjects);
            } else {
                console.log('没有其他外部注入对象的记录');
            }

            // 添加点击事件监听器以触发日志输出
            document.addEventListener('click', logCallRecords);

        });
    }

    let copyfunc;

    function initCopyFunction() {
        copyfunc = navigator.clipboard.writeText.bind(navigator.clipboard);
    }

    function copyTextToClipboard(text) {
        try {
            copyfunc(text);
            console.log('文本已成功复制到剪贴板', text);
        } catch (err) {
            console.error('无法复制到剪贴板:', err);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initCopyFunction()
    } else {
        document.addEventListener('DOMContentLoaded', initCopyFunction);
    }

    if (document.readyState === 'complete') {
        init()
    } else {
        window.addEventListener("load", init)
    }


})();