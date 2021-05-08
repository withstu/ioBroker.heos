var queueHandler;
on({ id: '0_userdata.0.heos.queue_pid', change: 'any' }, function (obj) {
    if(queueHandler){
        unsubscribe(queueHandler);
    }
    let pid = obj.state.val;
    let data = JSON.parse(getState("heos.0.players." + pid + ".queue").val);
    updateHTML(pid, data);
    queueHandler = on({ id: 'heos.0.players.' + pid + '.queue', change: 'any' }, function(obj){
        updateHTML(pid, JSON.parse(obj.state.val));
    });
});

function updateHTML(pid, data) {
    let current_qid = getState("heos.0.players." + pid + ".current_qid").val;
    let html = `<style>
    .heos-queue {
        background-color: #333333;
        color: #eaeaea;
        height: 100%;
        width: 100%;
        position: absolute;
        overflow: auto;
    }
    .heos-queue table {
        width: 100%;
        border-collapse: collapse;
    }
    .heos-queue table, 
    .heos-queue th, 
    .heos-queue td {
        border: 1px solid #929292;
        border-width:1px 0;
    }
    .heos-queue th {
        font-size: 2em;
        border: 1px solid #c50000;
        border-width: 0 0 1px 0;
        text-align: center;
    }
    .heos-queue th {
        padding: 15px;
        height: 60px;
    }
    .heos-queue td {
        padding: 5px;
        height: 60px;
    }
    .heos-queue-btn {
        color: #fff;
        background-color: Transparent;
        background-repeat:no-repeat;
        border: none;
        cursor:pointer;
        overflow: hidden;
        outline:none;
        margin: 0 !important;
        padding: 0 !important;
        font-size: 30px !important;
        line-height: 30px;
        width: 60px;
        height: 60px;
    }
    .heos-queue-btn-multi {
        border-right: 1px solid #929292;
    }
    .heos-queue-row-media {
        cursor: pointer;
    }
    .heos-queue-row-media.playing{
        background-color: green;
    }
    .heos-queue-row-control {
        color: #d60000;
        cursor: pointer;
    }
    .heos-queue-image {
        white-space: nowrap;
        padding: 0 !important;
        text-align: right;
        font-size: 0;
    }
    .heos-queue-image img {
        height: 60px;
    }
    .heos-queue-name {
        width: 100%;
        text-align: left;
    }
    .heos-queue-control {
        padding: 0 !important;
        margin: 0 !important;
        white-space: nowrap;
        font-size: 0;
        text-align: right;
    }
    </style>`;
    if (data) {
        html += "<div class=\"heos-queue\">"
        html += "<table>"
        html += "<tr><th>";
        html += "</th><th>" + data.name + "</th><th></th></tr>";
        for (let i = 0; i < data.payload.length; i++) {
            let payload = data.payload[i];
            html += "<tr class=\"";
            if (payload.type == "control") {
                html += "heos-queue-row-control";
            } else {
                html += "heos-queue-row-media"
                if(current_qid == payload.qid){
                    html += " playing"
                }
            }
            html += "\">";
            html += "<td class=\"heos-queue-image\"";
            html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands[Object.keys(payload.commands)[0]].replace(/'/g, "\\'") + "')\"";
            html += ">"
            if (payload.image_url.length) {
                html += "<img src=\"" + payload.image_url + "\">";
            }
            html += "</td>";
            html += "<td class=\"heos-queue-name\"";
            html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands[Object.keys(payload.commands)[0]].replace(/'/g, "\\'") + "')\"";
            html += ">"
            let meta = [];
            if (payload.song) {
                meta.push(payload.song);
            }
            if (payload.artist) {
                meta.push(payload.artist);
            }
            if (payload.album) {
                meta.push(payload.album);
            }
            if (payload.type == "control") {
                switch (payload.name) {
                    case "load_next":
                        html += "Next page";
                        break;
                    case "load_prev":
                        html += "Previous page";
                        break;
                }
            } else if (meta.length) {
                html += meta.join(' <br> ');
            }
            html += "</td>";
            html += "<td class=\"heos-queue-control\">";
            for (let key in payload.commands) {
                let command = payload.commands[key];
                html += "<button class=\"heos-queue-btn"
                if (Object.keys(payload.commands).length > 1) {
                    html += " heos-queue-btn-multi"
                }
                html += "\" onClick=\"servConn.setState('heos.0.command','" + command.replace(/'/g, "\\'") + "')\">"
                switch (key) {
                    case "play":
                        html += "►";
                        break;
                    case "browse":
                        html += ">";
                        break;
                }
                html += "</button>";
            }
            html += "</td>";
            html += "</tr>";
        }
        html += "</table></div>";
    }
    setState("0_userdata.0.heos.queue_html", html);
};