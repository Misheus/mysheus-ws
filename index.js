if(typeof global === "object") {
    global.WebSocket = require('ws');
    global.uuid = require('uuid').v4;
    global.EventEmitter = require('events');
}
/** Класс, который отвечает за всё это говно.*/
class MysheusWs extends EventEmitter{
    #ws
    #url
    debug
    strict
    #subs
    // #key //for v1
    // #subs
    // #name
    #querries = {}
    #wasopen = false
    #requestClose = false
    /** Собственно, конструктор. Неожиданно.
     * @param {string}url - Ссылка на сервер. Должна включать в себя гет параметры.
     * @param {boolean}[debug=false] - Включает расширеное ведение логов, включая все входящие и исходящие сообщения.
     * */
    constructor(url/*, key, subs, name */, debug = false) {//for v1
        super()
        this.#url = url
        this.debug = debug
        this.#subs = (Object.fromEntries(url.split('?')[1].split("&").map(v => v.split('=')).filter(v => v[0] && typeof v[1] !== "undefined").map(v => [v[0], decodeURIComponent(v[1])])).subscriptions || "").split(',').concat('open','close','reconnect','message','firstopen')
        // this.#key = key //for v1
        // this.#subs = subs
        // this.#name = name
        this.#connect()
    }

    get readyState () {
        return this.#ws.readyState
    }

    /** Метод для непосредственного подключения к самому Веб Сокету
     * @private
     * */
    #connect = () => {
        if(this.debug) console.log('Подключение...')
        this.#ws = new WebSocket(this.#url);
        if(WebSocket.on)
        {
            this.#ws.on('open', this.#onopen);
            this.#ws.on('error', this.#onerror);
            this.#ws.on('close', this.#onclose);
            this.#ws.on('message', this.#onmessage);
        }
        else
        {
            this.#ws.onopen = this.#onopen;
            this.#ws.onerror = this.#onerror;
            this.#ws.onclose = this.#onclose;
            this.#ws.onmessage = this.#onmessage;
        }
    }
    /** Обработчик непосредственного подключения к самому Веб Сокету
     * @private
     * */
    #onopen = () => {
        /*this.send({
            type:"SUBSCRIBE",
            payload:{
                secret: this.#key,
                subscriptions: this.#subs,
                name: this.#name
            }
        });*///for v1
        if(this.debug) console.log('Подключились')
        if (!this.#wasopen) this.emit('firstopen')
        else this.emit('reconnect')
        this.#wasopen = true;
        this.emit('open')
        setTimeout(this.#checkPing, 30000)
    }
    /** Обработчик непосредственного отдключения к самому Веб Сокету
     * @private
     * @param {number}code
     * @param {string}reason
     * */
    #onclose = (code, reason) => {
        this.emit('close')
        console.log('Этой хуйне опять пизда!', code, reason)
        if(!this.#requestClose)
            setTimeout(this.#connect, 1000)
    }
    /** Обработчик ошибок непосредственного самомго Веб Сокету
     * @private
     * @param {Object}e
     * */
    #onerror = (e) => {
        console.error(e)
    }

    /**
     * @typedef {json}inputMsg
     * @property {string}[query]
     * @property {string}[type]
     * @property {string}[value]
     * @property {Object|string|number}[answer]
     * */



    /** Обработчик входящих сообщений непосредственного от самого Веб Сокету
     * @private
     * @param {{data:inputMsg}|inputMsg}data
     * */
    #onmessage = (data) => {
        if(typeof data === "object") data = data.data
        data = JSON.parse(data);
        if(this.debug) console.log('<-', data)
        /*if(data.type === 'SUCCESSFUL_SUBSCRIBED' ||
            (data.type === 'system' && data.payload.type === 'INFO' && data.payload.info === 'SUCCESSFUL_SUBSCRIBED')
        ){
            if (!this.#wasopen) this.emit('firstopen')
            else this.emit('reconnect')
            this.#wasopen = true;
            this.emit('open')
            this.#checkPing()
        }//for v1
        else */if(data.query)
        {
            if(this.debug) console.log('Получен запрос на ответ')
            this.emit(data.type, (value) => {
                this.send({
                    type: data.type,
                    answer: data.query,
                    value: value
                })
            })
        }
        else if(data.type === 'PONG')
        {
            if(this.#pingPromise) {
                this.#pingPromise.resolve()
                this.#pingPromise = null
            }
        }
        else if(data.answer)
        {
            if(this.debug) console.log('Получен ответ')
            if(this.#querries[data.answer]) {
                this.#querries[data.answer].resolve(data.value)
                delete this.#querries[data.answer]
            }
        }
        else {
            if(this.debug) console.log('Получено сообщение')
            this.emit(data.type, data)
            this.emit('message', data)
        }
    }
    /** Отправить сообщение.
     * @param {Object|string}data - сообщение. Объект или JSON.
     * */
    send = (data) => {
        if(this.debug) console.log('->', data)
        if(typeof data === "object") data = JSON.stringify(data)
        //TODO проверять вс.реадистате и делать что-то в зависимости от него, а то исключение
        try {
            this.#ws.send(data)
        } catch (e) {
            //TODO //TODO //TODO блять, почему тодо не работают? //fixme починить //TODO
        }
    }
    /** Запросить данные от другово клиента.
     * @param {string}what - то, что мы хотим запросить. Создаст событие с таким названием на удалённом подписанном клиенте.
     * @param {Object|string|number}[additionalData=null] - Дополнительная информация о запросе, которую получит удалённый клиент.
     * @param {number}[timeout=5000] - Время ожидания ответа в миллисекундах.
     * @return {Promise<Object|string|number>} - Промис, который резолвится в ответ от удалённого клиента.
     * */
    query = (what, additionalData = null, timeout = 5000) => {
        if(this.debug) console.log('Отправляем запрос')
        return new Promise((resolve, reject) => {
            let id = uuid();
            this.#querries[id] = {resolve, reject}
            this.send({type: what, query: id, payload: additionalData})
            setTimeout(this.#checkQuerryTimeout, timeout, id)
        })
    }

    close = ()=>{
        if(this.debug) console.log("Closing because close() method was called")
        this.#requestClose = true
        if(this.#pingPromise) {
            this.#pingPromise.resolve()
            this.#pingPromise = null
        }
        this.#ws.close()
    }


    #pingPromise
    /** Пингование сервера.
     * @private
     * @param {number}[timeout=5000] - Время ожидания ответа.
     * */
    #ping = (timeout = 5000) => {
        return new Promise((resolve, reject) => {
            this.send({"type":"PING"})
            this.#pingPromise = {resolve, reject}
            setTimeout(this.#checkPingTimeout, timeout)
        })
    }
    /** Обработчик пингования сервера
     * @private
     * */
    #checkPing = () => {
        //console.log('ping')
        this.#ping().then(() => {
            if(!this.#requestClose)
                setTimeout(this.#checkPing, 30000)
            //console.log('ping done')
        }).catch(e => {
            if(e.toString() === 'Error: Ping timeout!')
            {
                console.log('Ping timeout. Reconnecting...')
                this.#ws.close()
            }
            else throw e;
        })
    }

    /** Обработчик таймаута пингования сервера
     * @private
     * */
    #checkPingTimeout = () => {
        if(this.#pingPromise) {
            this.#pingPromise.reject(new Error('Ping timeout!'))
            this.#pingPromise = null;
        }
    }
    /** Обработчик таймаута для MysheusWs.query().
     * @private
     * @param {string}id - Айди запроса.
     * */
    #checkQuerryTimeout = (id) => {
        if(this.#querries[id]) {
            this.#querries[id].reject(new Error('Timeout occurred!'))
            delete this.#querries[id]
        }
    }
    /**
     * @param {string}event - Название эвента. Если евент необходимо получить от удалённого клиента, не забудьте указать его в подписках. Используйте строгий режим, чтобы получать исключения при попытке обработки евентов, которые не указаны в подписках.
     * @param {function}listener - Функция обработки евента.
     * @type this
     * */
    on(event, listener) {
        if(!this.#subs.includes(event))
        {
            let err = new Error("Э, ты на эвент " + event + " не подписан, ежжи!")
            if(this.strict)
                throw err
            else console.error(err)
        }
        super.on(event, listener)
    }
}
if(typeof global === "object") module.exports = MysheusWs;