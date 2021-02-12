on({id: 'heos.0.sources.browse_result', change: 'any'}, function (obj) {
    let data = JSON.parse(obj.state.val);
    let html = `<style>
    .heos-browse {
        background-color: #333333;
        color: #eaeaea;
        height: 100%;
        width: 100%;
        position: absolute;
        overflow: auto;
    }
    .heos-browse table {
        width: 100%;
        border-collapse: collapse;
    }
    .heos-browse table, 
    .heos-browse th, 
    .heos-browse td {
        border: 1px solid #929292;
        border-width:1px 0;
    }
    .heos-browse th {
        font-size: 2em;
        border: 1px solid #c50000;
        border-width: 0 0 1px 0;
        text-align: center;
    }
    .heos-browse th {
        padding: 15px;
        height: 60px;
    }
    .heos-browse td {
        padding: 5px;
        height: 60px;
    }
    .heos-browse-btn {
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
    .heos-browse-btn-multi {
        border-right: 1px solid #929292;
    }
    .heos-browse-row-media {
        cursor: pointer;
    }
    .heos-browse-row-control {
        color: #d60000;
        cursor: pointer;
    }
    .heos-browse-image {
        white-space: nowrap;
        padding: 0 !important;
        text-align: right;
        font-size: 0;
    }
    .heos-browse-image img {
        height: 60px;
    }
    .heos-browse-name {
        width: 100%;
        text-align: left;
    }
    .heos-browse-control {
        padding: 0 !important;
        margin: 0 !important;
        white-space: nowrap;
        font-size: 0;
        text-align: right;
    }
    </style>`;
    if(data){
        html += "<div class=\"heos-browse\">"
        html += "<table>"
        html += "<tr><th>";
        if(data.image_url.length){
            html += "<img src=\"" + data.image_url + "\" height=\"30px\">";
        }
        html += "</th><th>" + (data.name == "sources" ? "Overview" : data.name) + "</th><th></th></tr>";
        for (let i = 0; i < data.payload.length; i++) {
            let payload = data.payload[i];
            html += "<tr class=\"";
            if(payload.type == "control"){
              html += "heos-browse-row-control";
            } else {
                html += "heos-browse-row-media"
            }
            html += "\">";
            html += "<td class=\"heos-browse-image\"";
            if("browse" in payload.commands){
                html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands["browse"].replace(/'/g, "\\'") +"')\"";
            } else if(Object.keys(payload.commands).length == 1){
                html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands[Object.keys(payload.commands)[0]].replace(/'/g, "\\'") +"')\"";
            }
            html += ">"
            if(payload.image_url.length){
              html += "<img src=\"" + payload.image_url + "\">";
            }
            html += "</td>";
            html += "<td class=\"heos-browse-name\"";
            if("browse" in payload.commands){
                html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands["browse"].replace(/'/g, "\\'") + "')\"";
            } else if(Object.keys(payload.commands).length == 1){
                html += " onClick=\"servConn.setState('heos.0.command','" + payload.commands[Object.keys(payload.commands)[0]].replace(/'/g, "\\'") +"')\"";
            }
            html += ">"
            if(payload.type == "control"){
              switch(payload.name){
                case "load_next":
                  html += "Next page";
                  break;
                case "load_prev":
                  html += "Previous page";
                  break;
                case "play_all":
                  html += "Play all";
                  break;
                case "back":
                  html += "Back";
                  break;
                case "sources":
                  html += "Overview";
                  break;
              }
            } else {
              html += payload.name;
            }
            html +="</td>";
            html += "<td class=\"heos-browse-control\">";
            for (let key in payload.commands) {
              let command = payload.commands[key];
              html += "<button class=\"heos-browse-btn"
              if(Object.keys(payload.commands).length > 1){
                  html += " heos-browse-btn-multi"
              }
              html += "\" onClick=\"servConn.setState('heos.0.command','" + command.replace(/'/g, "\\'") +"')\">" 
              switch(key){
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
    setState("0_userdata.0.heos.browse_result_html", html);
  });