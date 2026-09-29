Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' Le serveur vit a cote du script : aucun chemin en dur, le depot peut etre
' clone ou deplace n'importe ou.
Dim ici : ici = fso.GetParentFolderName(WScript.ScriptFullName)
' Demarre le serveur si pas deja en route
Set http = CreateObject("MSXML2.XMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:4360/api/drives", False
http.Send
If Err.Number <> 0 Then
    sh.Run "node """ & ici & "\server.js""", 0, False
    WScript.Sleep 1500
End If
On Error GoTo 0
sh.Run "http://localhost:4360", 1, False
