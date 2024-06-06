/**
 * @fileoverview 滚动位置管理模块
 * @version 1.0
 * @author huajiqaq
 * 
 * 这个模块使用 IndexedDB 来保存和恢复网页的滚动位置。
 * 它还包括清理过期数据和删除特定网页数据的功能。
 */

(function () {

    // 定义IndexedDB相关常量
    const SCROLL_POSITION_DB_NAME = 'scroll-position-db'; // 数据库的名字
    const DB_VERSION = 1; // 数据库版本号，用于版本升级
    const STORE_NAME = 'scroll-position'; // 对象存储的名称
    const EXPIRATION_PERIOD = 10 * 24 * 60 * 60 * 1000; // 记录过期时间，10天

    // 获取当前页面的URL
    const url = window.location.hostname + window.location.pathname;

    // 定义一个scrollRestorer模块，用于保存和恢复滚动位置
    window.scrollRestorer = (() => {
        let dbPromise = null; // 用于存储数据库实例的Promise

        // 打开IndexedDB数据库
        async function openDB() {
            if (!dbPromise) {
                dbPromise = new Promise((resolve, reject) => {
                    const request = indexedDB.open(SCROLL_POSITION_DB_NAME, DB_VERSION);

                    request.onerror = () => reject(`数据库错误: ${request.errorCode}`);
                    request.onsuccess = () => resolve(request.result);
                    request.onupgradeneeded = event => {
                        const db = event.target.result;
                        // 创建一个对象存储，使用'url'属性作为键路径，并创建一个唯一的'url'索引
                        db.createObjectStore(STORE_NAME, { keyPath: 'url' }).createIndex('url', 'url', { unique: true });
                    };
                });
            }
            return dbPromise;
        }

        // 保存滚动位置，包括当前时间戳
        async function saveScrollPosition() {
            const timestamp = new Date().getTime(); // 获取当前时间戳
            const db = await openDB(); // 等待数据库打开
            const tx = db.transaction(STORE_NAME, 'readwrite'); // 开始一个可读写事务
            const store = tx.objectStore(STORE_NAME); // 获取对象存储
            const position = window.scrollY; // 获取滚动位置
            const obj = { url, position, timestamp }; // 创建要保存的对象
            store.put(obj); // 将对象保存到对象存储
            await tx.done; // 等待事务完成
            console.info("已保存 对象", obj);
        }

        // 恢复滚动位置
        async function restoreScrollPosition() {
            const db = await openDB(); // 等待数据库打开
            const tx = db.transaction(STORE_NAME, 'readonly'); // 开始一个只读事务
            const store = tx.objectStore(STORE_NAME); // 获取对象存储
            const request = store.get(url); // 发送获取请求
            // 等待请求成功
            await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const data = request.result;
            const position = data?.position ?? null; // 获取记录中的滚动位置
            if (position && position > 10) {
                window.scrollTo(0, position); // 如果滚动位置存在且大于10，恢复滚动位置
                console.info("已恢复", data);
            }
        }

        // 清除过期的滚动位置记录
        async function clearExpiredEntries() {
            const db = await openDB(); // 等待数据库打开
            const tx = db.transaction(STORE_NAME, 'readwrite'); // 开始一个可读写事务
            const store = tx.objectStore(STORE_NAME); // 获取对象存储
            const now = new Date().getTime(); // 获取当前时间戳
            const cursorRequest = store.openCursor(); // 打开一个游标

            return new Promise(resolve => {
                cursorRequest.onsuccess = async function () {
                    const cursor = cursorRequest.result;
                    if (cursor) {
                        if (cursor.value.timestamp < now - EXPIRATION_PERIOD) {
                            cursor.delete(); // 如果记录已过期，删除它
                        }
                        cursor.continue(); // 继续下一个记录
                    } else {
                        await tx.done; // 等待事务完成
                        resolve(); // 解析Promise
                    }
                };
            });
        }

        // 防抖处理过的滚动事件处理器
        let debounceTimeout;
        function handleScroll() {
            clearTimeout(debounceTimeout); // 清除之前的计时器
            debounceTimeout = setTimeout(() => {
                saveScrollPosition(); // 1秒后保存滚动位置
            }, 1000);
        }

        let isInitialized = false; // 标记是否已初始化滚动监听

        // 初始化滚动监听
        function initializeScrollTracking() {
            if (isInitialized) return; // 如果已初始化，直接返回
            restoreScrollPosition(); // 恢复滚动位置
            window.addEventListener('scroll', handleScroll); // 添加滚动事件监听器
            isInitialized = true; // 设置初始化标记为true
        }

        // 停止滚动监听
        function stopScrollTracking() {
            window.removeEventListener('scroll', handleScroll); // 移除滚动事件监听器
            isInitialized = false; // 设置初始化标记为false
        }

        // 删除当前网页的数据
        async function deleteCurrentPageData() {
            try {
                const db = await openDB(); // 等待数据库打开
                const tx = db.transaction(STORE_NAME, 'readwrite'); // 开始一个可读写事务
                const store = tx.objectStore(STORE_NAME); // 获取对象存储
                store.delete(url); // 发送删除请求

                // 等待事务完成
                await tx.done;

                console.info("已删除当前网页的数据");
            } catch (error) {
                console.error("删除当前网页数据时发生错误:", error);
            }
        }

        // 删除所有数据库数据
        async function deleteAllData() {
            try {
                const db = await openDB(); // 等待数据库打开
                const tx = db.transaction(STORE_NAME, 'readwrite'); // 开始一个可读写事务
                const store = tx.objectStore(STORE_NAME); // 获取对象存储
                store.clear(); // 发送清除所有数据的请求

                // 等待事务完成
                await tx.done;

                console.info("已删除所有数据库数据");
            } catch (error) {
                console.error("删除所有数据库数据时发生错误:", error);
            }
        }

        // 返回scrollRestorer模块的方法
        return {
            initializeScrollTracking, // 初始化滚动监听的方法
            stopScrollTracking, // 停止滚动监听的方法
            saveScrollPosition, // 保存滚动位置的方法
            restoreScrollPosition, // 恢复滚动位置的方法
            clearExpiredEntries, // 清除过期条目的方法
            deleteCurrentPageData, // 删除当前网页的数据的方法
            deleteAllData // 删除所有数据库数据的方法
        };
    })();


    // 检查文档是否加载完成
    if (document.readyState === 'complete') {
        // 初始化滚动监听
        scrollRestorer.initializeScrollTracking();
    } else {
        window.addEventListener("load", scrollRestorer.initializeScrollTracking)
    }

})()