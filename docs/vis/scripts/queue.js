on({id: '0_userdata.0.heos.queue_pid', change: 'any'}, function (obj) {
    let pid = obj.state.val;
    let data = JSON.parse(getState("heos.0.players." + pid + ".queue").val);
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
        height: 60px
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
        //cursor: pointer;
    }
    .heos-queue-row-control {
        color: #d60000;
        //cursor: pointer;
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
    if(data){
        html += "<div class=\"heos-queue\">"
        html += "<table>"
        html += "<tr><th>";
        html += "</th><th>Queue</th><th></th></tr>";
        for (var qid in data) {
            let payload = data[qid];
            html += "<tr class=\"heos-queue-row-media\">";
            html += "<td class=\"heos-queue-image\">";
            if(payload.image_url.length){
              html += "<img src=\"" + payload.image_url + "\">";
            }
            html += "</td>";
            html += "<td class=\"heos-queue-name\">";
            let meta = [];
            if(payload.song){
              meta.push(payload.song);
            }
            if(payload.artist){
              meta.push(payload.artist);
            }
            if(payload.album){
              meta.push(payload.album);
            }
            if(meta.length){
              html += meta.join(' <br> ');
            }
            html +="</td>";
            html += "<td class=\"heos-queue-control\">";
            html += "</td>";
            html += "</tr>";
        }
        html += "</table></div>";
    }
    setState("0_userdata.0.heos.queue_html", html);
  });