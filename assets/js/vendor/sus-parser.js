/* Vendored GPL-3.0 Uni PJSK Viewer SUS parser. See THIRD_PARTY.md and vendor/src. */
(function(global){
// @ts-nocheck
                                                               

const FRACTION_RE = /^([+-]?\d+)\/(\d+)$/
const DECIMAL_RE = /^([+-]?\d+)(?:\.(\d+))?$/

const bigintAbs = (value        )         => (value < 0n ? -value : value)

const gcd = (a        , b        )         => {
    let x = bigintAbs(a)
    let y = bigintAbs(b)
    while (y !== 0n) {
        const t = x % y
        x = y
        y = t
    }
    return x || 1n
}

const normalize = (numerator        , denominator        )                   => {
    if (denominator === 0n) {
        throw new Error('Denominator cannot be zero')
    }

    if (denominator < 0n) {
        numerator = -numerator
        denominator = -denominator
    }

    const g = gcd(numerator, denominator)
    return [numerator / g, denominator / g]
}

const parseDecimalString = (value        )                   => {
    const trimmed = value.trim()
    if (!trimmed.length) {
        throw new Error('Empty number string')
    }

    const fractionMatch = trimmed.match(FRACTION_RE)
    if (fractionMatch) {
        const numerator = BigInt(fractionMatch[1])
        const denominator = BigInt(fractionMatch[2])
        return normalize(numerator, denominator)
    }

    const decimalMatch = trimmed.match(DECIMAL_RE)
    if (decimalMatch) {
        const integerPart = decimalMatch[1]
        const decimalPart = decimalMatch[2] ?? ''
        const scale = 10n ** BigInt(decimalPart.length)
        const whole = BigInt(integerPart)
        const sign = whole < 0n || integerPart.startsWith('-') ? -1n : 1n
        const absWhole = bigintAbs(whole)
        const absNumber = BigInt(`${absWhole}${decimalPart}`)
        return normalize(sign * absNumber, scale)
    }

    // fallback for scientific notation from Number.toString(), e.g. 1e-7
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid number: ${value}`)
    }

    return fromNumber(parsed)
}

const fromNumber = (value        , maxDenominator = 1_000_000n)                   => {
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${value}`)
    }

    const sign = value < 0 ? -1n : 1n
    const abs = Math.abs(value)
    const whole = Math.floor(abs)
    const fractional = abs - whole

    if (fractional === 0) {
        return [sign * BigInt(whole), 1n]
    }

    // Continued fraction approximation.
    let h1 = 1n
    let h0 = 0n
    let k1 = 0n
    let k0 = 1n

    let b = fractional
    let a = Math.floor(b)

    for (let i = 0; i < 64; i += 1) {
        const h2 = BigInt(a) * h1 + h0
        const k2 = BigInt(a) * k1 + k0

        if (k2 > maxDenominator) {
            break
        }

        h0 = h1
        h1 = h2
        k0 = k1
        k1 = k2

        const fracPart = b - a
        if (Math.abs(fracPart) < 1e-12) {
            break
        }

        b = 1 / fracPart
        a = Math.floor(b)
    }

    const numerator = sign * (BigInt(whole) * k1 + h1)
    const denominator = k1
    return normalize(numerator, denominator)
}

class Fraction {
             numerator        
             denominator        

    constructor(value                = 0, denominator                ) {
        if (denominator !== undefined) {
            const left = Fraction.from(value)
            const right = Fraction.from(denominator)
            const [n, d] = normalize(
                left.numerator * right.denominator,
                left.denominator * right.numerator,
            )
            this.numerator = n
            this.denominator = d
            return
        }

        if (value instanceof Fraction) {
            this.numerator = value.numerator
            this.denominator = value.denominator
            return
        }

        if (typeof value === 'bigint') {
            this.numerator = value
            this.denominator = 1n
            return
        }

        if (typeof value === 'number') {
            const [n, d] = fromNumber(value)
            this.numerator = n
            this.denominator = d
            return
        }

        const [n, d] = parseDecimalString(value)
        this.numerator = n
        this.denominator = d
    }

    static from(value               )           {
        return value instanceof Fraction ? value : new Fraction(value)
    }

    static zero()           {
        return new Fraction(0)
    }

    static one()           {
        return new Fraction(1)
    }

    add(value               )           {
        const other = Fraction.from(value)
        return new Fraction(
            this.numerator * other.denominator + other.numerator * this.denominator,
            this.denominator * other.denominator,
        )
    }

    sub(value               )           {
        const other = Fraction.from(value)
        return new Fraction(
            this.numerator * other.denominator - other.numerator * this.denominator,
            this.denominator * other.denominator,
        )
    }

    mul(value               )           {
        const other = Fraction.from(value)
        return new Fraction(this.numerator * other.numerator, this.denominator * other.denominator)
    }

    div(value               )           {
        const other = Fraction.from(value)
        return new Fraction(this.numerator * other.denominator, this.denominator * other.numerator)
    }

    neg()           {
        return new Fraction(-this.numerator, this.denominator)
    }

    abs()           {
        return new Fraction(bigintAbs(this.numerator), this.denominator)
    }

    floor()         {
        if (this.numerator >= 0n) {
            return this.numerator / this.denominator
        }
        return -((-this.numerator + this.denominator - 1n) / this.denominator)
    }

    ceil()         {
        if (this.numerator >= 0n) {
            return (this.numerator + this.denominator - 1n) / this.denominator
        }
        return -((-this.numerator) / this.denominator)
    }

    limitDenominator(maxDenominator        )           {
        if (maxDenominator <= 0) {
            return new Fraction(this)
        }
        return new Fraction(this.toNumber())
    }

    compare(value               )         {
        const other = Fraction.from(value)
        const left = this.numerator * other.denominator
        const right = other.numerator * this.denominator
        if (left < right) return -1
        if (left > right) return 1
        return 0
    }

    equals(value               )          {
        return this.compare(value) === 0
    }

    toNumber()         {
        return Number(this.numerator) / Number(this.denominator)
    }

    isInteger()          {
        return this.denominator === 1n
    }

    key()         {
        return `${this.numerator}/${this.denominator}`
    }

    toString()         {
        if (this.denominator === 1n) {
            return this.numerator.toString()
        }
        return `${this.numerator}/${this.denominator}`
    }
}


// @ts-nocheck

const prefer =    (current                      , incoming                      )                       =>
    current ? current : incoming ?? current

const fractionOrNull = (value                                               )                  => {
    if (value === undefined || value === null) {
        return null
    }
    return value instanceof Fraction ? value : new Fraction(value)
}

const fractionToNumber = (value                             , fallback        )         =>
    value ? value.toNumber() : fallback

class Meta {
    title                = null
    subtitle                = null
    artist                = null
    genre                = null
    designer                = null
    difficulty                = null
    playlevel                = null
    songid                = null
    wave                = null
    waveoffset                = null
    jacket                = null
    background                = null
    movie                = null
    movieoffset                = null
    basebpm                = null

    constructor(values                ) {
        if (values) {
            Object.assign(this, values)
        }
    }

    merge(other      )       {
        return new Meta({
            title: prefer(this.title, other.title) ?? null,
            subtitle: prefer(this.subtitle, other.subtitle) ?? null,
            artist: prefer(this.artist, other.artist) ?? null,
            genre: prefer(this.genre, other.genre) ?? null,
            designer: prefer(this.designer, other.designer) ?? null,
            difficulty: prefer(this.difficulty, other.difficulty) ?? null,
            playlevel: prefer(this.playlevel, other.playlevel) ?? null,
            songid: prefer(this.songid, other.songid) ?? null,
            wave: prefer(this.wave, other.wave) ?? null,
            waveoffset: prefer(this.waveoffset, other.waveoffset) ?? null,
            jacket: prefer(this.jacket, other.jacket) ?? null,
            background: prefer(this.background, other.background) ?? null,
            movie: prefer(this.movie, other.movie) ?? null,
            movieoffset: prefer(this.movieoffset, other.movieoffset) ?? null,
            basebpm: prefer(this.basebpm, other.basebpm) ?? null,
        })
    }
}

class Event {
    bar          
    bpm                 
    barLength                 
    sentenceLength               
    speed               
    seVolume               
    section               
    text               

    constructor(values   
                                       
                                               
                                                     
                                      
                             
                                
                               
                            
     ) {
        this.bar = values.bar instanceof Fraction ? values.bar : new Fraction(values.bar)
        this.bpm = fractionOrNull(values.bpm)
        this.barLength = fractionOrNull(values.barLength)
        this.sentenceLength = values.sentenceLength ?? null
        this.speed = values.speed ?? null
        this.seVolume = values.seVolume ?? null
        this.section = values.section ?? null
        this.text = values.text ?? null
    }

    merge(other       )        {
        return new Event({
            bar: other.bar,
            bpm: (other.bpm ?? this.bpm) ?? null,
            barLength: (other.barLength ?? this.barLength) ?? null,
            sentenceLength: (other.sentenceLength ?? this.sentenceLength) ?? null,
            speed: (other.speed ?? this.speed) ?? null,
            seVolume: (other.seVolume ?? this.seVolume) ?? null,
            section: (other.section ?? this.section) ?? null,
            text: (other.text ?? this.text) ?? null,
        })
    }

    clone()        {
        return new Event({
            bar: this.bar,
            bpm: this.bpm,
            barLength: this.barLength,
            sentenceLength: this.sentenceLength,
            speed: this.speed,
            seVolume: this.seVolume,
            section: this.section,
            text: this.text,
        })
    }
}

class Note {
    bar          
    lane        
    width        
    type        
    speed               

              constructor(values   
                                       
                    
                     
                    
                             
     ) {
        this.bar = values.bar instanceof Fraction ? values.bar : new Fraction(values.bar)
        this.lane = values.lane
        this.width = values.width
        this.type = values.type
        this.speed = values.speed ?? null
    }

    isCritical()          {
        return false
    }

    isTrend()          {
        return false
    }

    isNone()          {
        return false
    }

    isTick()                 {
        return true
    }

                                              
}

const TapType = {
    TAP: 1,
    CRITICAL: 2,
    FLICK: 3,
    DAMAGE: 4,
    TREND: 5,
    CRITICAL_TREND: 6,
    CANCEL: 7,
    CRITICAL_CANCEL: 8,
}         

class Tap extends Note {
    isCritical()          {
        return (
            this.type === TapType.CRITICAL ||
            this.type === TapType.CRITICAL_TREND ||
            this.type === TapType.CRITICAL_CANCEL
        )
    }

    isTrend()          {
        return this.type === TapType.TREND || this.type === TapType.CRITICAL_TREND
    }

    isNone()          {
        return this.type === TapType.CANCEL || this.type === TapType.CRITICAL_CANCEL
    }

    isTick()                 {
        if (this.isNone()) {
            return null
        }
        if (this.isTrend()) {
            return false
        }
        return true
    }

    cloneWithBar(bar          )      {
        return new Tap({
            bar,
            lane: this.lane,
            width: this.width,
            type: this.type,
            speed: this.speed,
        })
    }
}

const DirectionalType = {
    UP: 1,
    DOWN: 2,
    UPPER_LEFT: 3,
    UPPER_RIGHT: 4,
    LOWER_LEFT: 5,
    LOWER_RIGHT: 6,
}         

class Directional extends Note {
    tap            

    constructor(values   
                                       
                    
                     
                    
                             
                        
     ) {
        super(values)
        this.tap = values.tap ?? null
    }

    isCritical()          {
        return this.tap ? this.tap.isCritical() : false
    }

    isTrend()          {
        return this.tap ? this.tap.isTrend() : false
    }

    isTick()                 {
        if (this.isNone()) {
            return null
        }
        if (this.isTrend()) {
            return false
        }
        return true
    }

    cloneWithBar(bar          )              {
        return new Directional({
            bar,
            lane: this.lane,
            width: this.width,
            type: this.type,
            speed: this.speed,
            tap: null,
        })
    }
}

const SlideType = {
    START: 1,
    END: 2,
    RELAY: 3,
    INVISIBLE: 5,
}         

class Slide extends Note {
    channel        
    decoration         
    tap            
    directional                    
    next              
    head              

    constructor(values   
                                       
                    
                     
                    
                             
                        
                            
                        
                                        
                           
                           
     ) {
        super(values)
        this.channel = values.channel ?? 0
        this.decoration = values.decoration ?? false
        this.tap = values.tap ?? null
        this.directional = values.directional ?? null
        this.next = values.next ?? null
        this.head = values.head ?? null
    }

    isPath()          {
        if (this.type === 0) {
            return false
        }

        if (this.type !== SlideType.RELAY) {
            return true
        }

        if (this.directional) {
            return true
        }

        if (this.tap === null && this.directional === null) {
            return true
        }

        return false
    }

    isCritical()          {
        if (this.tap && this.tap.isCritical()) {
            return true
        }
        if (this.directional && this.directional.isCritical()) {
            return true
        }
        if (this.head && this.head !== this && this.head.isCritical()) {
            return true
        }
        return false
    }

    isTrend()          {
        if (this.tap && this.tap.isTrend()) {
            return true
        }
        if (this.directional && this.directional.isTrend()) {
            return true
        }
        return false
    }

    isNone()          {
        if (this.tap && this.tap.isNone()) {
            return true
        }
        if (this.directional && this.directional.isNone()) {
            return true
        }
        return false
    }

    isTick()                 {
        if (this.isNone()) {
            return null
        }

        if (this.decoration) {
            const tapTick = this.tap ? this.tap.isTick() : null
            if (tapTick) {
                return tapTick
            }

            const directionalTick = this.directional ? this.directional.isTick() : null
            if (directionalTick) {
                return directionalTick
            }

            if (tapTick !== null || directionalTick !== null) {
                return false
            }

            return null
        }

        if (this.type === SlideType.INVISIBLE) {
            return null
        }
        if (this.isTrend()) {
            return false
        }
        if (this.type === SlideType.RELAY) {
            return false
        }

        return true
    }

    cloneWithBar(bar          )        {
        return new Slide({
            bar,
            lane: this.lane,
            width: this.width,
            type: this.type,
            speed: this.speed,
            channel: this.channel,
            decoration: this.decoration,
            tap: null,
            directional: null,
            next: null,
            head: null,
        })
    }
}

                                               

class Score {
    meta = new Meta()
    notes            = []
    events          = []
    ticksPerBeat = 480

            timedEventsCache                                = null

    invalidateCache() {
        this.timedEventsCache = null
    }

    sortNotes() {
        this.notes.sort((a, b) => {
            const cmp = a.bar.compare(b.bar)
            if (cmp !== 0) {
                return cmp
            }
            return a.lane - b.lane
        })
    }

    initNotes() {
        this.sortNotes()

        const noteDeleted = new Array         (this.notes.length).fill(false)
        const noteIndexes = new Map                  ()

        for (let i = 0; i < this.notes.length; i += 1) {
            const note = this.notes[i]
            if (!(0 <= note.lane - 2 && note.lane - 2 < 12)) {
                noteDeleted[i] = true
                this.events.push(
                    new Event({
                        bar: note.bar,
                        text:
                            note.lane === 0
                                ? 'SKILL'
                                : note.type === 1
                                  ? 'FEVER CHANCE!'
                                  : 'SUPER FEVER!!',
                    }),
                )
                continue
            }

            const key = note.bar.key()
            const indexes = noteIndexes.get(key)
            if (indexes) {
                indexes.push(i)
            } else {
                noteIndexes.set(key, [i])
            }
        }

        for (let i = 0; i < this.notes.length; i += 1) {
            const directional = this.notes[i]
            if (noteDeleted[i] || !(directional instanceof Directional)) {
                continue
            }

            const indexes = noteIndexes.get(directional.bar.key())
            if (!indexes) {
                continue
            }

            for (const j of indexes) {
                const tap = this.notes[j]
                if (noteDeleted[j] || !(tap instanceof Tap)) {
                    continue
                }

                if (
                    tap.bar.equals(directional.bar) &&
                    tap.lane === directional.lane &&
                    tap.width === directional.width
                ) {
                    noteDeleted[j] = true
                    directional.tap = tap
                }
            }
        }

        for (let i = 0; i < this.notes.length; i += 1) {
            const slide = this.notes[i]
            if (noteDeleted[i] || !(slide instanceof Slide)) {
                continue
            }

            if (slide.head === null) {
                slide.head = slide
            }

            const indexes = noteIndexes.get(slide.bar.key())
            if (indexes) {
                for (const j of indexes) {
                    const tap = this.notes[j]
                    if (noteDeleted[j] || !(tap instanceof Tap)) {
                        continue
                    }

                    if (tap.bar.equals(slide.bar) && tap.lane === slide.lane && tap.width === slide.width) {
                        noteDeleted[j] = true
                        slide.tap = tap
                    }
                }

                for (const j of indexes) {
                    const directional = this.notes[j]
                    if (noteDeleted[j] || !(directional instanceof Directional)) {
                        continue
                    }

                    if (
                        directional.bar.equals(slide.bar) &&
                        directional.lane === slide.lane &&
                        directional.width === slide.width
                    ) {
                        noteDeleted[j] = true
                        slide.directional = directional
                        if (directional.tap) {
                            slide.tap = directional.tap
                        }
                    }
                }
            }

            if (slide.type !== SlideType.END) {
                for (let j = i + 1; j < this.notes.length; j += 1) {
                    const next = this.notes[j]
                    if (
                        noteDeleted[j] ||
                        !(next instanceof Slide) ||
                        next.channel !== slide.channel ||
                        next.decoration !== slide.decoration
                    ) {
                        continue
                    }

                    slide.next = next
                    next.head = slide.head
                    break
                }
            }
        }

        this.notes = this.notes.filter((_, idx) => !noteDeleted[idx])
        this.sortNotes()
    }

    initEvents() {
        this.events.sort((a, b) => a.bar.compare(b.bar))

        const merged          = []
        for (const event of this.events) {
            const last = merged[merged.length - 1]
            if (last && event.bar.equals(last.bar)) {
                merged[merged.length - 1] = last.merge(event)
            } else {
                merged.push(event.clone())
            }
        }

        this.events = merged
        this.invalidateCache()
    }

            getTimedEvents()                         {
        if (this.timedEventsCache) {
            return this.timedEventsCache
        }

        const timedEvents                         = []

        let t = 0
        let current = new Event({
            bar: 0,
            bpm: 120,
            barLength: 4,
            sentenceLength: 4,
        })

        for (const event of this.events) {
            t +=
                event.bar.sub(current.bar).toNumber() *
                fractionToNumber(current.barLength, 4) *
                60 /
                fractionToNumber(current.bpm, 120)

            current = current.merge(event)
            timedEvents.push([t, current])
        }

        if (!timedEvents.length) {
            timedEvents.push([0, current])
        }

        this.timedEventsCache = timedEvents
        return timedEvents
    }

    getTimedEvent(barInput                   )                  {
        const bar = barInput instanceof Fraction ? barInput : new Fraction(barInput)
        const timedEvents = this.getTimedEvents()

        let index = 0
        let low = 0
        let high = timedEvents.length - 1
        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            const cmp = timedEvents[mid][1].bar.compare(bar)
            if (cmp <= 0) {
                index = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        const [baseTime, event] = timedEvents[index]
        const delta = fractionToNumber(event.barLength, 4) * 60 / fractionToNumber(event.bpm, 120)
        const time = baseTime + delta * bar.sub(event.bar).toNumber()
        return [time, event]
    }

    getTime(bar                   )         {
        return this.getTimedEvent(bar)[0]
    }

    getEvent(bar                   )        {
        return this.getTimedEvent(bar)[1]
    }

    getTimeDelta(barFrom                   , barTo                   )         {
        return this.getTime(barTo) - this.getTime(barFrom)
    }

    getBarByTime(time        )           {
        let t = 0
        let event = new Event({
            bar: 0,
            bpm: 120,
            barLength: 4,
            sentenceLength: 4,
        })

        for (let i = 0; i < this.events.length; i += 1) {
            event = event.merge(this.events[i])
            if (i + 1 === this.events.length) {
                break
            }

            const next = this.events[i + 1]
            const eventTime =
                fractionToNumber(event.barLength, 4) *
                60 /
                fractionToNumber(event.bpm, 120) *
                next.bar.sub(event.bar).toNumber()

            if (t + eventTime > time) {
                break
            }

            t += eventTime
        }

        const bar =
            event.bar.toNumber() +
            (time - t) / (fractionToNumber(event.barLength, 4) * 60 / fractionToNumber(event.bpm, 120))

        return new Fraction(bar).limitDenominator(1_000_000)
    }
}


// @ts-nocheck


                            
               
                
                 
 

                             
               
                
                  
 

                 
                                   
                                             
                                                    
                                                                           
                                                                 
                                     
                                                          
                                                         
                                                        

                   
                                      
                  
                
 

const metaKeys = new Set        ([
    'title',
    'subtitle',
    'artist',
    'genre',
    'designer',
    'difficulty',
    'playlevel',
    'songid',
    'wave',
    'waveoffset',
    'jacket',
    'background',
    'movie',
    'movieoffset',
    'basebpm',
])

const parseLine = (line        )             => {
    const trimmed = line.trim()

    let match = trimmed.match(/^#(\w+)\s+(.*)$/)
    if (match) {
        return {
            type: 'meta',
            header: match[1],
            data: match[2],
        }
    }

    match = trimmed.match(/^#(\w+):\s*(.*)$/)
    if (match) {
        return {
            type: 'score',
            header: match[1],
            data: match[2],
        }
    }

    return {
        type: 'comment',
        header: 'comment',
        data: trimmed,
    }
}

const maybeUnquote = (value        )         => {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

const parseMetaValue = (value        )                  => {
    const trimmed = value.trim()
    if (!trimmed.length) {
        return ''
    }

    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }

    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        return Number(trimmed)
    }

    return trimmed
}

const sanitizeSpeedRatio = (value        )         => {
    if (!Number.isFinite(value) || value <= 0) {
        return 1
    }
    return value
}

const visibleSpeedRatio = (value        )                => {
    const speedRatio = sanitizeSpeedRatio(value)
    return Math.abs(speedRatio - 1) > 0.0001 ? speedRatio : null
}

const parseScoreData = (data        )                                                              => {
    const cleaned = data.trim()
    const result                                                              = []

    if (cleaned.includes(',')) {
        const cells                                              = []
        let i = 0

        while (i < cleaned.length) {
            while (i < cleaned.length && /\s/u.test(cleaned[i])) {
                i += 1
            }

            if (i + 1 >= cleaned.length) {
                break
            }

            const pair = cleaned.slice(i, i + 2)
            i += 2

            let speedRatio = 1
            if (i < cleaned.length && cleaned[i] === ',') {
                i += 1
                const speedStart = i
                while (i < cleaned.length && !/\s/u.test(cleaned[i]) && cleaned[i] !== ',') {
                    i += 1
                }

                if (i > speedStart) {
                    speedRatio = Number(cleaned.slice(speedStart, i))
                }
            }

            cells.push({ pair, speedRatio: sanitizeSpeedRatio(speedRatio) })

            while (i < cleaned.length && (/\s/u.test(cleaned[i]) || cleaned[i] === ',')) {
                i += 1
            }
        }

        for (let i = 0; i < cells.length; i += 1) {
            const cell = cells[i]
            if (cell.pair !== '00') {
                result.push({
                    beat: new Fraction(i, cells.length),
                    pair: cell.pair,
                    speedRatio: cell.speedRatio,
                })
            }
        }

        return result
    }

    for (let i = 0; i + 1 < cleaned.length; i += 2) {
        const pair = cleaned.slice(i, i + 2)
        if (pair !== '00') {
            result.push({
                beat: new Fraction(i, cleaned.length),
                pair,
                speedRatio: 1,
            })
        }
    }

    return result
}

const parseTimedValueDefinitions = (data        )                                                      => {
    const text = maybeUnquote(data)
    const list                                                      = []

    if (!text.length) {
        return list
    }

    for (const rawSegment of text.split(',')) {
        const segment = rawSegment.trim()
        if (!segment.length) {
            continue
        }

        const match = segment.match(/(\d+)'(\d+):(\S+)/)
        if (!match) {
            continue
        }

        const value = Number(match[3])
        if (!Number.isFinite(value)) {
            continue
        }

        list.push({
            bar: Number(match[1]),
            tick: Number(match[2]),
            value,
        })
    }

    list.sort((a, b) => (a.bar === b.bar ? a.tick - b.tick : a.bar - b.bar))
    return list
}

const parseMetaItems = (header        , data        )               => {
    const items               = []

    const meta = new Meta()
    const key = header.toLowerCase()
    if (metaKeys.has(key)) {
        ;(meta                                      )[key] = parseMetaValue(data)
        items.push({ kind: 'meta', value: meta })
        return items
    }

    if (header === 'REQUEST') {
        const match = data.match(/^"ticks_per_beat\s+(\d+)"$/)
        if (match) {
            items.push({
                kind: 'ticksPerBeat',
                value: Number(match[1]),
            })
        }
        return items
    }

    if (header === 'HISPEED') {
        const id = Number.parseInt(data, 36)
        if (Number.isFinite(id)) {
            items.push({ kind: 'speedControl', value: id })
        }
        return items
    }

    if (header === 'NOSPEED') {
        items.push({ kind: 'speedControl', value: null })
    }

    return items
}

const parseScoreItems = (header        , data        )               => {
    const items               = []

    let match = header.match(/^(\d\d\d)02$/)
    if (match) {
        items.push({
            kind: 'event',
            value: new Event({
                bar: Number(match[1]),
                barLength: Number(data.trim()),
            }),
        })
        return items
    }

    match = header.match(/^BPM(..)$/)
    if (match) {
        items.push({
            kind: 'bpmDefinition',
            id: Number.parseInt(match[1], 36),
            bpm: new Fraction(data.trim()),
        })
        return items
    }

    match = header.match(/^(\d\d\d)08$/)
    if (match) {
        const bar = Number(match[1])
        for (const { beat, pair } of parseScoreData(data)) {
            items.push({
                kind: 'bpmReference',
                bar: new Fraction(bar).add(beat),
                id: Number.parseInt(pair, 36),
            })
        }
        return items
    }

    match = header.match(/^TIL(..)$/)
    if (match) {
        const id = Number.parseInt(match[1], 36)
        const list = parseTimedValueDefinitions(data).map((item) => ({
            bar: item.bar,
            tick: item.tick,
            speed: item.value,
        }))

        items.push({
            kind: 'speedDefinition',
            id,
            items: list,
        })
        return items
    }

    if (header.startsWith('VOLUME')) {
        items.push({
            kind: 'volumeDefinition',
            items: parseTimedValueDefinitions(data).map((item) => ({
                bar: item.bar,
                tick: item.tick,
                volume: item.value,
            })),
        })
        return items
    }

    match = header.match(/^(\d\d\d)1(.)$/)
    if (match) {
        const bar = Number(match[1])
        const lane = Number.parseInt(match[2], 36)
        for (const { beat, pair, speedRatio } of parseScoreData(data)) {
            items.push({
                kind: 'note',
                value: new Tap({
                    bar: new Fraction(bar).add(beat),
                    lane,
                    width: Number.parseInt(pair[1], 36),
                    type: Number.parseInt(pair[0], 36),
                    speed: visibleSpeedRatio(speedRatio),
                }),
            })
        }
        return items
    }

    match = header.match(/^(\d\d\d)3(.)(.)$/)
    if (match) {
        const bar = Number(match[1])
        const lane = Number.parseInt(match[2], 36)
        const channel = Number.parseInt(match[3], 36)
        for (const { beat, pair, speedRatio } of parseScoreData(data)) {
            items.push({
                kind: 'note',
                value: new Slide({
                    bar: new Fraction(bar).add(beat),
                    lane,
                    width: Number.parseInt(pair[1], 36),
                    type: Number.parseInt(pair[0], 36),
                    speed: visibleSpeedRatio(speedRatio),
                    channel,
                    decoration: false,
                }),
            })
        }
        return items
    }

    match = header.match(/^(\d\d\d)5(.)$/)
    if (match) {
        const bar = Number(match[1])
        const lane = Number.parseInt(match[2], 36)
        for (const { beat, pair, speedRatio } of parseScoreData(data)) {
            items.push({
                kind: 'note',
                value: new Directional({
                    bar: new Fraction(bar).add(beat),
                    lane,
                    width: Number.parseInt(pair[1], 36),
                    type: Number.parseInt(pair[0], 36),
                    speed: visibleSpeedRatio(speedRatio),
                }),
            })
        }
        return items
    }

    match = header.match(/^(\d\d\d)9(.)(.)$/)
    if (match) {
        const bar = Number(match[1])
        const lane = Number.parseInt(match[2], 36)
        const channel = Number.parseInt(match[3], 36)
        for (const { beat, pair, speedRatio } of parseScoreData(data)) {
            items.push({
                kind: 'note',
                value: new Slide({
                    bar: new Fraction(bar).add(beat),
                    lane,
                    width: Number.parseInt(pair[1], 36),
                    type: Number.parseInt(pair[0], 36),
                    speed: visibleSpeedRatio(speedRatio),
                    channel,
                    decoration: true,
                }),
            })
        }
        return items
    }

    return items
}

const parseSusText = (content        )        => {
    const score = new Score()

    const bpmDefinitions = new Map                  ()
    let speedControl                = null

    const lines = content.split(/\r?\n/u).map(parseLine)

    for (const line of lines) {
        const parsedItems =
            line.type === 'meta'
                ? parseMetaItems(line.header, line.data)
                : line.type === 'score'
                  ? parseScoreItems(line.header, line.data)
                  : []

        for (const parsedItem of parsedItems) {
            switch (parsedItem.kind) {
                case 'meta':
                    score.meta = score.meta.merge(parsedItem.value)
                    break

                case 'ticksPerBeat':
                    score.ticksPerBeat = parsedItem.value
                    break

                case 'speedControl':
                    speedControl = parsedItem.value
                    break

                case 'speedDefinition':
                    if (speedControl === null || speedControl === parsedItem.id) {
                        for (const item of parsedItem.items) {
                            const bar = new Fraction(item.bar).add(
                                new Fraction(item.tick, score.ticksPerBeat * 4),
                            )
                            score.events.push(
                                new Event({
                                    bar,
                                    speed: item.speed,
                                }),
                            )
                        }
                    }
                    break

                case 'volumeDefinition':
                    for (const item of parsedItem.items) {
                        const bar = new Fraction(item.bar).add(
                            new Fraction(item.tick, score.ticksPerBeat * 4),
                        )
                        score.events.push(
                            new Event({
                                bar,
                                seVolume: item.volume,
                            }),
                        )
                    }
                    break

                case 'event':
                    score.events.push(parsedItem.value)
                    break

                case 'bpmDefinition':
                    bpmDefinitions.set(parsedItem.id, parsedItem.bpm)
                    break

                case 'bpmReference': {
                    const bpm = bpmDefinitions.get(parsedItem.id)
                    if (bpm) {
                        score.events.push(
                            new Event({
                                bar: parsedItem.bar,
                                bpm,
                            }),
                        )
                    }
                    break
                }

                case 'note':
                    score.notes.push(parsedItem.value)
                    break
            }
        }
    }

    score.initNotes()
    score.initEvents()

    return score
}


global.YoisakiSUS={parseSusText,Fraction,Score,Tap,Slide,Directional,TapType,SlideType,DirectionalType};
})(typeof window!=="undefined"?window:globalThis);
