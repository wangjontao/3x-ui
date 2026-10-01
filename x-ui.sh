#!/bin/bash

red='\033[0;31m'
green='\033[0;32m'
blue='\033[0;34m'
yellow='\033[0;33m'
plain='\033[0m'

#Add some basic function here
function LOGD() {
    echo -e "${yellow}[DEG] $* ${plain}"
}

function LOGE() {
    echo -e "${red}[ERR] $* ${plain}"
}

function LOGI() {
    echo -e "${green}[INF] $* ${plain}"
}

# Port helpers: detect listener and owning process (best effort)
is_port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | awk -v p=":${port}$" '$4 ~ p {exit 0} END {exit 1}'
        return
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -lnt 2>/dev/null | awk -v p=":${port} " '$4 ~ p {exit 0} END {exit 1}'
        return
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1 && return 0
    fi
    return 1
}

# Simple helpers for domain/IP validation
is_ipv4() {
    [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && return 0 || return 1
}
is_ipv6() {
    [[ "$1" =~ : ]] && return 0 || return 1
}
is_ip() {
    is_ipv4 "$1" || is_ipv6 "$1"
}
is_domain() {
    [[ "$1" =~ ^([A-Za-z0-9](-*[A-Za-z0-9])*\.)+(xn--[a-z0-9]{2,}|[A-Za-z]{2,})$ ]] && return 0 || return 1
}

# check root
[[ $EUID -ne 0 ]] && LOGE "ERROR: You must be root to run this script! \n" && exit 1

# Check OS and set release variable
if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    release=$ID
elif [[ -f /usr/lib/os-release ]]; then
    source /usr/lib/os-release
    release=$ID
else
    echo "Failed to check the system OS, please contact the author!" >&2
    exit 1
fi
echo "The OS release is: $release"

os_version=""
os_version=$(grep "^VERSION_ID" /etc/os-release | cut -d '=' -f2 | tr -d '"' | tr -d '.')

# Declare Variables
xui_folder="${XUI_MAIN_FOLDER:=/usr/local/x-ui}"
xui_service="${XUI_SERVICE:=/etc/systemd/system}"
log_folder="${XUI_LOG_FOLDER:=/var/log/x-ui}"
JULIANG_REPO="wangjontao/3x-ui"
JULIANG_BRANCH="juliang-stable-v2.9.3"
JULIANG_PANEL_VERSION="v2.9.3"
JULIANG_XRAY_VERSION="v26.4.25"
JULIANG_RELEASE="juliang-v2.9.3-r1"
JULIANG_RAW_BASE="https://raw.githubusercontent.com/${JULIANG_REPO}/${JULIANG_BRANCH}"
mkdir -p "${log_folder}"
iplimit_log_path="${log_folder}/3xipl.log"
iplimit_banned_log_path="${log_folder}/3xipl-banned.log"

confirm() {
    if [[ $# > 1 ]]; then
        echo && read -rp "$1 [Default $2]: " temp
        if [[ "${temp}" == "" ]]; then
            temp=$2
        fi
    else
        read -rp "$1 [y/n]: " temp
    fi
    if [[ "${temp}" == "y" || "${temp}" == "Y" ]]; then
        return 0
    else
        return 1
    fi
}

confirm_restart() {
    confirm "Restart the panel, Attention: Restarting the panel will also restart xray" "y"
    if [[ $? == 0 ]]; then
        restart
    else
        show_menu
    fi
}

before_show_menu() {
    echo -e "
╔────────────────────────────────────────────────╗
│   ${green}JuLiang-UI 稳定版管理菜单${plain}                  │
│   ${green}0.${plain} 退出脚本                                 │
│────────────────────────────────────────────────│
│   ${green}1.${plain} 安装 JuLiang-UI                         │
│   ${green}2.${plain} 更新稳定版（版本锁定）                    │
│   ${green}3.${plain} 更新管理脚本（已锁定）                    │
│   ${green}4.${plain} 旧版本功能（已锁定）                      │
│   ${green}5.${plain} 卸载                                     │
│────────────────────────────────────────────────│
│   ${green}6.${plain} 重置用户名和密码                          │
│   ${green}7.${plain} 重置 Web 访问路径                         │
│   ${green}8.${plain} 重置面板设置                              │
│   ${green}9.${plain} 修改面板端口                              │
│  ${green}10.${plain} 查看当前设置                              │
│────────────────────────────────────────────────│
│  ${green}11.${plain} 启动面板                                  │
│  ${green}12.${plain} 停止面板                                  │
│  ${green}13.${plain} 重启面板                                  │
│  ${green}14.${plain} 重启 Xray                                 │
│  ${green}15.${plain} 查看运行状态                              │
│  ${green}16.${plain} 日志管理                                  │
│────────────────────────────────────────────────│
│  ${green}17.${plain} 开启开机自启                              │
│  ${green}18.${plain} 关闭开机自启                              │
│────────────────────────────────────────────────│
│  ${green}19.${plain} SSL 证书管理                              │
│  ${green}20.${plain} Cloudflare SSL 证书                       │
│  ${green}21.${plain} IP 限制 / Fail2ban 管理                   │
│  ${green}22.${plain} 防火墙管理                                │
│  ${green}23.${plain} SSH 端口转发管理                          │
│────────────────────────────────────────────────│
│  ${green}24.${plain} BBR 加速管理                              │
│  ${green}25.${plain} 更新 Geo 文件                             │
│  ${green}26.${plain} Ookla 网络测速                            │
╚────────────────────────────────────────────────╝
"
    show_status
    echo && read -rp "请输入选项 [0-26]: " num

    case "${num}" in
    0)
        exit 0
        ;;
    1)
        check_uninstall && install
        ;;
    2)
        check_install && update
        ;;
    3)
        check_install && update_menu
        ;;
    4)
        check_install && legacy_version
        ;;
    5)
        check_install && uninstall
        ;;
    6)
        check_install && reset_user
        ;;
    7)
        check_install && reset_webbasepath
        ;;
    8)
        check_install && reset_config
        ;;
    9)
        check_install && set_port
        ;;
    10)
        check_install && check_config
        ;;
    11)
        check_install && start
        ;;
    12)
        check_install && stop
        ;;
    13)
        check_install && restart
        ;;
    14)
        check_install && restart_xray
        ;;
    15)
        check_install && status
        ;;
    16)
        check_install && show_log
        ;;
    17)
        check_install && enable
        ;;
    18)
        check_install && disable
        ;;
    19)
        ssl_cert_issue_main
        ;;
    20)
        ssl_cert_issue_CF
        ;;
    21)
        iplimit_main
        ;;
    22)
        firewall_menu
        ;;
    23)
        SSH_port_forwarding
        ;;
    24)
        bbr_menu
        ;;
    25)
        update_geo
        ;;
    26)
        run_speedtest
        ;;
    *)
        LOGE "Please enter the correct number [0-26]"
        ;;
    esac
}

if [[ $# > 0 ]]; then
    case $1 in
    "start")
        check_install 0 && start 0
        ;;
    "stop")
        check_install 0 && stop 0
        ;;
    "restart")
        check_install 0 && restart 0
        ;;
    "restart-xray")
        check_install 0 && restart_xray 0
        ;;
    "status")
        check_install 0 && status 0
        ;;
    "settings")
        check_install 0 && check_config 0
        ;;
    "enable")
        check_install 0 && enable 0
        ;;
    "disable")
        check_install 0 && disable 0
        ;;
    "log")
        check_install 0 && show_log 0
        ;;
    "banlog")
        check_install 0 && show_banlog 0
        ;;
    "update")
        check_install 0 && update 0
        ;;
    "legacy")
        check_install 0 && legacy_version 0
        ;;
    "install")
        check_uninstall 0 && install 0
        ;;
    "uninstall")
        check_install 0 && uninstall 0
        ;;
    "update-all-geofiles")
        check_install 0 && update_all_geofiles 0 && restart 0
        ;;
    *) show_usage ;;
    esac
else
    show_menu
fi
