/**
 * @fileoverview 此脚本用于记录知乎Hybrid层的交互
 * 使用抓包注入 在body下添加 
 * <script>js内容</script>
 * @version 0.1
 * @author huajiqaq
 */

window.zhihuWebApp = new Proxy(window.zhihuWebApp, {
    get(target, prop, receiver) {
        // 获取原始属性值
        const value = Reflect.get(target, prop, receiver);

        // 如果是函数，返回一个新函数，该函数在调用时会打印参数
        if (typeof value === 'function') {
            // 如果获取的是callback方法，返回原来的callback
            if (prop === 'callback') {
                return function (...args) {
                    const arg = args[0]
                    const arg2 = args[1]

                    // 示例 test(实际可能不存在)
                    const keywords = ['test'];


                    if (keywords.some(keyword => JSON.stringify(arg).includes(keyword))) {
                        if (arg2 == true) {
                            console.log(prop + "被触发", JSON.stringify(arg));
                            return value.apply(this, args); // 调用原始函数
                        }
                        console.log(prop + "被拦截", JSON.stringify(arg));
                        return
                    }

                    console.log(prop + "被触发", JSON.stringify(arg));
                    return value.apply(this, args); // 调用原始函数
                };
            }
            return function (...args) {
                console.log(prop + "被拦截", args);
                return value.apply(this, args); // 调用原始函数
            };
        }

        // 否则，返回其他属性或方法的默认行为
        return value;
    }
});



// 防止为空
window.zhihuNativeApp = window.zhihuNativeApp || {}

let zhihuNativeApp_ori = window.zhihuNativeApp
// 创建Proxy来代理zhihuNativeApp对象
window.zhihuNativeApp = new Proxy(window.zhihuNativeApp, {
    get(target, prop, receiver) {
        if (prop === 'sendToNative') {
            return function (...args) {
                const arg = args[0]
                const arg2 = args[1]

                // 示例 test(实际可能不存在)
                const keywords = ['test'];


                if (keywords.some(keyword => JSON.stringify(arg).includes(keyword))) {
                    if (arg2 == true) {
                        console.log(prop + "被触发", JSON.stringify(arg));
                        return zhihuNativeApp_ori[prop] && zhihuNativeApp_ori[prop](...args); // 调用原始函数
                    }
                    console.log(prop + "被拦截", JSON.stringify(arg));
                    return
                }

                console.log(prop + "被触发", args[0])
                return zhihuNativeApp_ori[prop] && zhihuNativeApp_ori[prop](...args); // 调用原始函数
            }
        }

        return function (...args) {
            console.log(prop + "被触发", args)
            return zhihuNativeApp_ori[prop] && zhihuNativeApp_ori[prop](...args); // 调用原始函数
        }


    },
});