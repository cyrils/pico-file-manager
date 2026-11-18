class App {

    constructor() {
        this.pico = new PicoSerial(this.onConnected.bind(this), this.onDisconnected.bind(this), this.log)
        this.connected = false
        this.running = null
        this.editableExtensions = new Set([
            'py', 'json', 'txt', 'md',
            'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml',
            'csv', 'tsv', 'log',
            'html', 'css', 'js', 'xml',
            'c', 'h', 'cpp', 'hpp', 'pio'
        ])
        this.errorMessages = { 39: 'Directory not empty!', 21: 'Directory exists!' }
        this.ignorePatterns = [
            ".git",
            ".github",
            "__pycache__",
            ".DS_Store",
            ".venv",
            "venv",
            ".idea",
            ".vscode"
        ]
    }

    init() {
        this.__onClick("#search", async () => {
            if (!navigator.serial) {
                await this.showDialog({
                    title: 'Web Serial unavailable',
                    message: 'Open Pico File Manager in a browser that supports Web Serial, such as Chrome.'
                })
                return
            }
            const connect = document.querySelector("#search")
            connect.disabled = true
            try {
                await this.pico.connect()
            } catch (error) {
                if (error.name !== 'NotFoundError') {
                    document.querySelector("#result").textContent = 'Could not connect to the device.'
                }
            } finally {
                connect.disabled = false
            }
        })
        this.__onClick('#dialog-cancel', () => document.querySelector('#app-dialog').close('cancel'))
        this.__onClick("#disconnect", async () => await this.pico.disconnect())
        this.__onClick("#reboot", () => {
            this.replCheck = null
            this.setRunning(true)
            this.pico.rebootDevice()
        })
        this.__onClick("#stop", async () => {
            if (this.running === false) return
            const previousState = this.running
            const port = this.pico.picoPort
            this.setRunning(false)
            try {
                await this.pico.stopDevice()
            } catch (error) {
                if (this.connected && this.pico.picoPort === port) {
                    this.setRunning(previousState)
                    document.querySelector('#result').textContent = 'Could not stop the program.'
                }
            }
        })
        this.__onClick("#tab-shell", this.showShell.bind(this))
        this.__onClick("#tab-files", this.showFilesTab.bind(this))
        this.__onClick("#save", () => {
            const fileContent = document.querySelector("#file-content")
            this.pico.saveFile(fileContent.dataset.file, fileContent.value, this.onFileSaved.bind(this))
        })
        const actionsMenu = document.querySelector("#actions-menu")
        if (actionsMenu) {
            actionsMenu.addEventListener("change", (e) => {
                const action = e.target.value
                if (action === "create-file") {
                    this.createFile()
                } else if (action === "create-folder") {
                    this.createFolder()
                } else if (action === "delete-all") {
                    this.deleteAll()
                }
                e.target.value = ""
            })
        }
        const uploadMenu = document.querySelector("#upload-menu")
        if (uploadMenu) {
            uploadMenu.addEventListener("change", (e) => {
                const action = e.target.value
                if (action === "upload-files") {
                    const fileInput = document.querySelector("#file-upload")
                    if (fileInput) fileInput.click()
                } else if (action === "upload-folder") {
                    const folderInput = document.querySelector("#folder-upload")
                    if (folderInput) folderInput.click()
                }
                e.target.value = ""
            })
        }
        const folderUploadInput = document.querySelector("#folder-upload")
        if (folderUploadInput) {
            folderUploadInput.addEventListener("change", this.uploadFiles.bind(this))
        }
        const fileUploadInput = document.querySelector("#file-upload")
        if (fileUploadInput) {
            fileUploadInput.addEventListener("change", this.uploadFiles.bind(this))
        }
        this.updateDeviceStatus()
        window.addEventListener('beforeunload', async () => await this.pico.stop())
    }

    onConnected(deviceDescription = 'USB serial device', deviceName = deviceDescription) {
        this.connected = true
        document.querySelector('#device-name').textContent = deviceName
        this.setRunning(null)
        this.updateDeviceStatus()
        const browser = document.querySelector('#browser')
        browser.dataset.dir = '/'
        browser.replaceChildren()
        document.querySelector('#result').textContent = ''
        this.clearLog()
        this.log(`[Connected to ${deviceDescription}]\n\n`)
        this.__hide('#search')
        this.__show('[data-connected]')
        this.showShell()
        this.checkRunningState()
    }

    onDisconnected() {
        this.connected = false
        document.querySelector('#device-name').textContent = 'No device'
        this.replCheck = null
        this.directoryRequest = null
        this.setDirectoryBusy(false)
        const dialog = document.querySelector('#app-dialog')
        if (dialog.open) dialog.close('cancel')
        this.updateDeviceStatus()
        this.__hide('[data-connected]')
        this.__show('#search')
        this.showShell()
        this.log(`\n[Pico disconnected]\n\n`)
    }

    onFileSaved(message) {
        document.querySelector("#result").textContent = message === "OK" ? "Saved!" : "Save failed!"
        setTimeout(() => { document.querySelector("#result").textContent = '' }, 3000)
    }

    log(message) {
        const filesTab = document.querySelector('#tab-files')
        if (filesTab && filesTab.classList.contains('active')) {
            return
        }
        let output = document.querySelector('#shell');
        if (output) {
            output.value += message;
            output.scrollTop = output.scrollHeight
        }
    }

    clearLog() {
        document.querySelector('#shell').value = '';
    }

    updateDeviceStatus() {
        const status = document.querySelector('#device-status')
        status.textContent = this.connected ? 'Connected' : 'Disconnected'
        status.parentElement.classList.toggle('connected', this.connected)
        document.querySelector('#shell-panel').classList.toggle('connected-terminal', this.connected)
        this.updateRunningIndicator()
        document.querySelector('#tab-files').disabled = !this.connected
    }

    updateRunningIndicator() {
        document.querySelector('#shell-panel').classList.toggle('running-terminal', this.connected && this.running === true)
    }

    checkRunningState() {
        if (!this.replCheck) {
            const check = this.pico.checkReplReady().then(replReady => {
                if (this.replCheck !== check) return
                this.replCheck = null
                if (this.running === null) this.setRunning(!replReady)
            })
            this.replCheck = check
        }
        return this.replCheck
    }

    setRunning(running) {
        this.running = running
        this.updateRunningIndicator()
        const stop = document.querySelector('#stop')
        stop.disabled = running === false
        stop.title = !stop.disabled ? 'Interrupt the program running on the Pico' : 'The Pico is stopped'
    }

    setView(showFiles) {
        const shellTab = document.querySelector('#tab-shell')
        const filesTab = document.querySelector('#tab-files')
        shellTab.classList.toggle('active', !showFiles)
        filesTab.classList.toggle('active', showFiles)
        shellTab.setAttribute('aria-pressed', !showFiles)
        filesTab.setAttribute('aria-pressed', showFiles)
    }

    showShell() {
        this.__hide('#files')
        this.__show('#shell-panel')
        if (this.connected) {
            this.__show(['#reboot', '#stop'])
        }
        this.setView(false)
    }

    async showFilesTab() {
        const filesTab = document.querySelector('#tab-files')
        if (!this.connected || filesTab.disabled) return

        if (this.running !== false) {
            const port = this.pico.picoPort
            filesTab.disabled = true
            try {
                if (this.running === null) {
                    await this.checkRunningState()
                    if (!this.connected || this.pico.picoPort !== port || this.running === null) return
                }

                if (this.running) {
                    const confirmed = await this.showDialog({
                        title: 'Stop the program?',
                        message: 'The Pico must be idle before you can browse files.',
                        action: 'Stop program',
                        cancel: true
                    })
                    if (!confirmed || !this.connected || this.pico.picoPort !== port) return
                    try {
                        await this.pico.stopDevice()
                    } catch (error) {
                        if (this.connected && this.pico.picoPort === port) {
                            document.querySelector('#result').textContent = 'Could not stop the program.'
                        }
                        return
                    }
                    if (!this.connected || this.pico.picoPort !== port) return
                    this.setRunning(false)
                    await new Promise(resolve => setTimeout(resolve, 300))
                    if (!this.connected || this.pico.picoPort !== port || this.running) return
                }
            } finally {
                if (this.pico.picoPort === port) filesTab.disabled = !this.connected
            }
        }

        this.__show('#files')
        this.__hide(['#shell-panel', '#reboot', '#stop'])
        this.setView(true)
        this.loadDirectory()
    }

    setDirectoryBusy(busy) {
        const browser = document.querySelector('#browser')
        browser.setAttribute('aria-busy', busy)
        browser.inert = busy
        document.querySelector('#folder-toolbar').inert = busy
        document.querySelector('.editor').inert = busy
    }

    loadDirectory(dir = document.querySelector('#browser').dataset.dir) {
        if (this.directoryRequest) return
        const browser = document.querySelector('#browser')
        const hasListing = browser.firstElementChild !== null
        if (!hasListing) {
            browser.appendChild(this.__createNode('p', 'browser-message', 'Loading files…'))
        }

        const finish = response => {
            if (this.directoryRequest !== finish) return
            this.directoryRequest = null
            this.setDirectoryBusy(false)
            if (response === false || (typeof response === 'string' && response.includes('OSError:'))) {
                const message = 'Could not load this folder.'
                if (hasListing) document.querySelector('#result').textContent = message
                else browser.firstElementChild.textContent = message
                return
            }

            browser.dataset.dir = dir
            const currentPath = document.querySelector('#current-path')
            currentPath.textContent = dir
            currentPath.title = dir

            const editor = document.querySelector('#file-content')
            editor.value = ''
            delete editor.dataset.file
            const editorTitle = document.querySelector('#editor-title')
            editorTitle.textContent = 'Editor'
            editorTitle.removeAttribute('title')
            this.__hide(['#save', '#file-content'])
            this.__show('#editor-empty')
            this.renderFiles(response)
        }

        this.directoryRequest = finish
        this.setDirectoryBusy(true)
        Promise.resolve(this.pico.listFiles(dir, finish)).catch(() => finish(false))
    }

    asyncShowFilesTab(output) {
        if (typeof output == 'string' && output.includes('OSError:')) {
            this.throwError(output)
        } else {
            setTimeout(this.showFilesTab.bind(this), 100)
        }
    }

    throwError(output) {
        const match = output.match(/OSError:.* (\d+)/)
        let message = 'An unknown device error occurred.'
        if (match && match[1]) {
            message = this.errorMessages[parseInt(match[1])] || message
        }
        this.showDialog({title: 'Device error', message})
    }

    renderFiles(response) {
        const browser = document.querySelector('#browser')
        const listing = document.createDocumentFragment()
        const currentDir = browser.dataset.dir
        const files = typeof response === 'string' ? response.split('\n').filter(Boolean) : []
        if (currentDir !== '/') files.unshift('..|True|0')
        if (files.length === 0) {
            listing.appendChild(this.__createNode('p', 'browser-message', 'This folder is empty.'))
        }

        files.forEach(file => {
            const [name, isDir] = file.split('|')
            const isFolder = isDir === 'True'
            const isParent = name === '..'
            const label = isParent ? 'Parent folder' : name
            const entry = listing.appendChild(this.__createNode('div', 'file-entry'))
            const fileButton = entry.appendChild(this.__createNode('button', 'file', null, label))
            const iconClass = isParent ? 'parent-symbol' : isFolder ? 'folder-symbol' : 'file-symbol'
            const icon = this.__createNode('span', iconClass, isParent ? '↑' : null)
            icon.setAttribute('aria-hidden', 'true')
            fileButton.append(icon, this.__createNode('span', 'file-name', label))

            if (isFolder) {
                fileButton.onclick = () => {
                    const dir = isParent
                        ? currentDir.slice(0, currentDir.lastIndexOf('/', currentDir.length - 2) + 1)
                        : currentDir + name + '/'
                    this.loadDirectory(dir)
                }
            } else {
                const filePath = currentDir + name
                const normalizedName = name.toLowerCase()
                const extensionStart = normalizedName.lastIndexOf('.')
                if (normalizedName === 'makefile' ||
                    (extensionStart >= 0 && this.editableExtensions.has(normalizedName.slice(extensionStart + 1)))) {
                    fileButton.onclick = () => {
                        this.pico.readFile(filePath, content => {
                            if (!fileButton.isConnected || !this.connected) return
                            this.renderFileContent(filePath, fileButton, content)
                        })
                    }
                } else {
                    fileButton.disabled = true
                    fileButton.title = name + ' (no text preview)'
                }
            }

            if (!isParent) {
                const rename = this.__createNode('button', 'file-action', '✎', 'Rename ' + name, this.renameFile.bind(this, name))
                const remove = this.__createNode('button', 'file-action', '×', 'Delete ' + name, this.deleteFile.bind(this, name))
                rename.setAttribute('aria-label', rename.title)
                remove.setAttribute('aria-label', remove.title)
                remove.classList.add('delete')
                entry.append(rename, remove)
            }
        })
        browser.replaceChildren(listing)
        browser.scrollTop = 0
    }

    renderFileContent(file, fileNode, content) {
        document.querySelectorAll('.file.selected').forEach(node => {
            node.classList.remove('selected')
            node.removeAttribute('aria-current')
        })
        fileNode.classList.add('selected')
        fileNode.setAttribute('aria-current', 'true')
        const editorTitle = document.querySelector('#editor-title')
        editorTitle.textContent = file.split('/').pop()
        editorTitle.title = file
        const editor = document.querySelector('#file-content')
        editor.dataset.file = file
        editor.value = content === true ? '' : content
        editor.placeholder = '(empty)'
        this.__hide('#editor-empty')
        this.__show(['#file-content', '#save'])
    }

    showDialog({title, message, label, value = '', action = 'OK', cancel = false, danger = false}) {
        const dialog = document.querySelector('#app-dialog')
        if (dialog.open) return Promise.resolve(null)

        const messageNode = document.querySelector('#dialog-message')
        const input = document.querySelector('#dialog-input')
        const cancelButton = document.querySelector('#dialog-cancel')
        const confirmButton = document.querySelector('#dialog-confirm')
        document.querySelector('#dialog-title').textContent = title
        messageNode.textContent = message || ''
        messageNode.hidden = !message
        if (message) dialog.setAttribute('aria-describedby', messageNode.id)
        else dialog.removeAttribute('aria-describedby')

        document.querySelector('#dialog-label').textContent = label || ''
        document.querySelector('#dialog-field').hidden = !label
        input.disabled = !label
        input.required = Boolean(label)
        input.value = value
        cancelButton.hidden = !cancel
        confirmButton.textContent = action
        confirmButton.classList.toggle('danger', danger)

        dialog.returnValue = ''
        return new Promise(resolve => {
            dialog.addEventListener('close', () => {
                resolve(dialog.returnValue === 'confirm' ? (label ? input.value : true) : null)
            }, {once: true})
            dialog.showModal()
            if (label) {
                input.focus()
                input.select()
            } else {
                (cancel ? cancelButton : confirmButton).focus()
            }
        })
    }

    async createFile() {
        const port = this.pico.picoPort
        const name = await this.showDialog({title: 'New file', label: 'File name', action: 'Create file', cancel: true})
        if (!name || !this.connected || this.pico.picoPort !== port) return
        const path = document.querySelector('#browser').dataset.dir + name
        this.pico.createFile(path, this.asyncShowFilesTab.bind(this))
    }

    async createFolder() {
        const port = this.pico.picoPort
        const name = await this.showDialog({title: 'New folder', label: 'Folder name', action: 'Create folder', cancel: true})
        if (!name || !this.connected || this.pico.picoPort !== port) return
        const path = document.querySelector('#browser').dataset.dir + name
        this.pico.createFolder(path, this.asyncShowFilesTab.bind(this))
    }

    async deleteFile(name) {
        const port = this.pico.picoPort
        const path = document.querySelector('#browser').dataset.dir + name
        const confirmed = await this.showDialog({
            title: 'Delete item?',
            message: 'Delete “' + name + '” from the Pico?',
            action: 'Delete',
            cancel: true,
            danger: true
        })
        if (confirmed && this.connected && this.pico.picoPort === port) {
            this.pico.deleteFile(path, this.asyncShowFilesTab.bind(this))
        }
    }

    async renameFile(name) {
        const port = this.pico.picoPort
        const dir = document.querySelector('#browser').dataset.dir
        const newName = await this.showDialog({
            title: 'Rename item', label: 'New name', value: name, action: 'Rename', cancel: true
        })
        if (newName && !newName.includes('/') && this.connected && this.pico.picoPort === port) {
            this.pico.renameFile(dir + name, dir + newName, this.asyncShowFilesTab.bind(this))
        }
    }

    __createNode(tag, className, text = null, title = null, onclick = null) {
        const newNode = document.createElement(tag)
        newNode.classList.add(className)
        if (text !== null) newNode.textContent = text
        title && (newNode.title = title)
        newNode.onclick = onclick
        return newNode
    }

    __onClick(selector, callback) {
        const node = document.querySelector(selector)
        node && node.addEventListener("click", callback)
    }

    __show(selectors) {
        if (!Array.isArray(selectors)) selectors = [selectors]
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(node => {
                node.classList.remove('hidden')
            })
        })
    }

    __hide(selectors) {
        if (!Array.isArray(selectors)) selectors = [selectors]
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(node => {
                node.classList.add('hidden')
            })
        })
    }

    isIgnored(relativePath) {
        const parts = relativePath.split('/');
        for (const part of parts) {
            if (!part) continue;
            if (this.ignorePatterns.includes(part)) return true;
            if (part.endsWith('.pyc') || part.endsWith('.swp') || part.endsWith('~')) return true;
        }
        return false;
    }

    async uploadFiles(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const fileBrowser = document.querySelector('#browser');
        const currentDir = fileBrowser.dataset.dir;
        const resultSpan = document.querySelector("#result");

        // Filter files to upload
        const filesToUpload = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const checkPath = file.webkitRelativePath || file.name;
            if (checkPath && !this.isIgnored(checkPath)) {
                filesToUpload.push(file);
            }
        }

        if (filesToUpload.length === 0) {
            resultSpan.textContent = "No valid files to upload.";
            setTimeout(() => { resultSpan.textContent = ''; }, 3000);
            return;
        }

        resultSpan.textContent = `Preparing to upload ${filesToUpload.length} file(s)...`;

        try {
            // Keep track of directories we already created during this upload to avoid redundant serial calls
            const createdDirs = new Set();

            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                let relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
                if (file.webkitRelativePath) {
                    const pathParts = relativePath.split('/');
                    pathParts.shift(); // Remove the top-level root folder
                    relativePath = pathParts.join('/');
                }
                const targetPath = currentDir + relativePath;

                // Determine parent directory path
                const parts = targetPath.split('/');
                parts.pop(); // Remove the filename to get parent dir
                const parentDir = parts.join('/');

                resultSpan.textContent = `Uploading [${i + 1}/${filesToUpload.length}]: ${file.name}...`;

                // Recursively create directory on Pico if not already created/root
                if (parentDir && parentDir !== '/' && !createdDirs.has(parentDir)) {
                    await this.pico.createFolderRecursive(parentDir);
                    createdDirs.add(parentDir);
                }

                // Read file content as ArrayBuffer
                const fileBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(file);
                });

                // Write file to Pico
                await this.pico.uploadFile(targetPath, fileBuffer);
            }

            resultSpan.textContent = `Uploaded ${filesToUpload.length} file(s) successfully!`;
            setTimeout(() => { resultSpan.textContent = ''; }, 5000);

            // Refresh directory list
            this.showFilesTab();
        } catch (error) {
            console.error('Upload error:', error);
            resultSpan.textContent = `Upload failed: ${error}`;
            this.showDialog({title: 'Upload failed', message: String(error)});
        } finally {
            event.target.value = '';
        }
    }

    async deleteAll() {
        const port = this.pico.picoPort
        const currentDir = document.querySelector('#browser').dataset.dir
        const confirmed = await this.showDialog({
            title: 'Delete everything in this folder?',
            message: 'This permanently deletes all files and subfolders inside “' + currentDir + '”.',
            action: 'Delete all',
            cancel: true,
            danger: true
        })
        if (confirmed && this.connected && this.pico.picoPort === port) {
            this.pico.deleteAllRecursive(currentDir, this.asyncShowFilesTab.bind(this))
        }
    }
}

window.addEventListener('DOMContentLoaded', () => new App().init())
